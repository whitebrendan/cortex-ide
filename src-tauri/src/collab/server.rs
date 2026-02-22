//! WebSocket Server for Peer Connections
//!
//! Provides a tokio-tungstenite WebSocket server for real-time
//! collaboration peer connections. Handles message routing,
//! room-level broadcasting, and connection lifecycle.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures::stream::SplitSink;
use futures::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex as TokioMutex, RwLock, broadcast};
use tokio::time::{Duration, Instant};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use crate::collab::types::CollabMessage;

type WsSink = SplitSink<WebSocketStream<TcpStream>, Message>;

/// Maximum allowed WebSocket text message size (10 MB)
const MAX_MESSAGE_SIZE: usize = 10 * 1024 * 1024;

/// Interval between server-side heartbeat sweeps
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// Peers with no activity for this duration are considered stale
const PEER_TIMEOUT: Duration = Duration::from_secs(90);

/// Represents a connected peer
struct PeerConnection {
    user_id: String,
    session_id: Option<String>,
    sink: Arc<TokioMutex<WsSink>>,
    last_activity: Instant,
}

/// Room-level broadcast channel
#[allow(dead_code)]
struct RoomBroadcast {
    tx: broadcast::Sender<String>,
}

/// WebSocket server for collaboration
pub struct CollabServer {
    port: u16,
    peers: Arc<RwLock<HashMap<SocketAddr, PeerConnection>>>,
    rooms: Arc<RwLock<HashMap<String, RoomBroadcast>>>,
    shutdown_tx: Option<broadcast::Sender<()>>,
    is_running: bool,
}

impl CollabServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            peers: Arc::new(RwLock::new(HashMap::new())),
            rooms: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx: None,
            is_running: false,
        }
    }

    /// Start the WebSocket server
    pub async fn start(&mut self, app: AppHandle) -> Result<u16, String> {
        if self.is_running {
            return Ok(self.port);
        }

        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind WebSocket server to {}: {}", addr, e))?;

        let actual_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?
            .port();

        self.port = actual_port;
        self.is_running = true;

        let (shutdown_tx, _) = broadcast::channel(1);
        self.shutdown_tx = Some(shutdown_tx.clone());

        let peers = self.peers.clone();
        let rooms = self.rooms.clone();

        info!(
            "Collaboration WebSocket server starting on port {}",
            actual_port
        );

        // Accept loop
        let mut shutdown_rx = shutdown_tx.subscribe();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, addr)) => {
                                let peers = peers.clone();
                                let rooms = rooms.clone();
                                let app = app.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(stream, addr, peers, rooms, app).await {
                                        warn!("WebSocket connection error from {}: {}", addr, e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Failed to accept WebSocket connection: {}", e);
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Collaboration WebSocket server shutting down");
                        break;
                    }
                }
            }
        });

        // Heartbeat loop — removes stale peers and cleans up empty rooms
        let peers_hb = self.peers.clone();
        let rooms_hb = self.rooms.clone();
        let mut shutdown_rx_hb = shutdown_tx.subscribe();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(PING_INTERVAL);
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        remove_stale_peers(&peers_hb).await;
                        cleanup_empty_rooms(&peers_hb, &rooms_hb).await;
                    }
                    _ = shutdown_rx_hb.recv() => break,
                }
            }
        });

        Ok(actual_port)
    }

    /// Stop the WebSocket server and clear all connection state
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        self.is_running = false;

        let peers = self.peers.clone();
        let rooms = self.rooms.clone();
        tokio::spawn(async move {
            peers.write().await.clear();
            rooms.write().await.clear();
        });

        info!("Collaboration WebSocket server stopped");
    }

    /// Check if the server is running
    pub fn is_running(&self) -> bool {
        self.is_running
    }

    /// Get the server port
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Broadcast a message to all peers in a specific session/room
    pub async fn broadcast_to_room(
        &self,
        session_id: &str,
        message: &CollabMessage,
        exclude_addr: Option<SocketAddr>,
    ) {
        let msg_json = match serde_json::to_string(message) {
            Ok(json) => json,
            Err(e) => {
                error!("Failed to serialize collab message: {}", e);
                return;
            }
        };

        let peers = self.peers.read().await;
        for (peer_addr, peer) in peers.iter() {
            if peer.session_id.as_deref() == Some(session_id) {
                if let Some(exclude) = exclude_addr {
                    if *peer_addr == exclude {
                        continue;
                    }
                }
                let sink = peer.sink.clone();
                let msg = msg_json.clone();
                tokio::spawn(async move {
                    let mut sink = sink.lock().await;
                    if let Err(e) = sink.send(Message::Text(msg)).await {
                        warn!("Failed to send message to peer: {}", e);
                    }
                });
            }
        }
    }
}

impl Default for CollabServer {
    fn default() -> Self {
        Self::new(4097)
    }
}

/// Remove peers that have not sent any messages within `PEER_TIMEOUT`
async fn remove_stale_peers(peers: &Arc<RwLock<HashMap<SocketAddr, PeerConnection>>>) {
    let mut peers_guard = peers.write().await;
    let stale_addrs: Vec<SocketAddr> = peers_guard
        .iter()
        .filter(|(_, peer)| peer.last_activity.elapsed() > PEER_TIMEOUT)
        .map(|(addr, _)| *addr)
        .collect();

    for addr in &stale_addrs {
        if let Some(peer) = peers_guard.remove(addr) {
            warn!(
                "Removing stale peer {} (user: {})",
                addr,
                if peer.user_id.is_empty() {
                    "unknown"
                } else {
                    &peer.user_id
                }
            );
        }
    }
}

/// Remove rooms that have no peers associated with them
async fn cleanup_empty_rooms(
    peers: &Arc<RwLock<HashMap<SocketAddr, PeerConnection>>>,
    rooms: &Arc<RwLock<HashMap<String, RoomBroadcast>>>,
) {
    let peers_guard = peers.read().await;
    let active_sessions: std::collections::HashSet<&str> = peers_guard
        .values()
        .filter_map(|p| p.session_id.as_deref())
        .collect();

    let mut rooms_guard = rooms.write().await;
    let empty_rooms: Vec<String> = rooms_guard
        .keys()
        .filter(|room_id| !active_sessions.contains(room_id.as_str()))
        .cloned()
        .collect();

    for room_id in &empty_rooms {
        rooms_guard.remove(room_id);
        info!("Removed empty room broadcast channel: {}", room_id);
    }
}

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    peers: Arc<RwLock<HashMap<SocketAddr, PeerConnection>>>,
    rooms: Arc<RwLock<HashMap<String, RoomBroadcast>>>,
    app: AppHandle,
) -> Result<(), String> {
    let ws_stream = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|e| format!("WebSocket handshake failed: {}", e))?;

    info!("New WebSocket connection from: {}", addr);

    let (sink, mut stream) = ws_stream.split();
    let sink = Arc::new(TokioMutex::new(sink));

    // Register the peer with a temporary ID
    {
        let mut peers_guard = peers.write().await;
        peers_guard.insert(
            addr,
            PeerConnection {
                user_id: String::new(),
                session_id: None,
                sink: sink.clone(),
                last_activity: Instant::now(),
            },
        );
    }

    // Process incoming messages
    while let Some(msg_result) = stream.next().await {
        match msg_result {
            Ok(Message::Text(ref text)) if text.len() > MAX_MESSAGE_SIZE => {
                warn!(
                    "Rejecting oversized message ({} bytes) from {}",
                    text.len(),
                    addr
                );
                let error_msg = CollabMessage::Error {
                    message: format!("Message too large ({} bytes)", text.len()),
                };
                if let Ok(json) = serde_json::to_string(&error_msg) {
                    let mut sink_guard = sink.lock().await;
                    let _ = sink_guard.send(Message::Text(json)).await;
                }
            }
            Ok(Message::Text(text)) => {
                // Update activity timestamp
                {
                    let mut peers_guard = peers.write().await;
                    if let Some(peer) = peers_guard.get_mut(&addr) {
                        peer.last_activity = Instant::now();
                    }
                }

                match serde_json::from_str::<CollabMessage>(&text) {
                    Ok(collab_msg) => {
                        handle_collab_message(&collab_msg, addr, &peers, &rooms, &sink).await;
                    }
                    Err(e) => {
                        warn!("Invalid message from {}: {}", addr, e);
                        let error_msg = CollabMessage::Error {
                            message: format!("Invalid message format: {}", e),
                        };
                        if let Ok(json) = serde_json::to_string(&error_msg) {
                            let mut sink_guard = sink.lock().await;
                            let _ = sink_guard.send(Message::Text(json)).await;
                        }
                    }
                }
            }
            Ok(Message::Ping(data)) => {
                // Update activity timestamp
                {
                    let mut peers_guard = peers.write().await;
                    if let Some(peer) = peers_guard.get_mut(&addr) {
                        peer.last_activity = Instant::now();
                    }
                }
                let mut sink_guard = sink.lock().await;
                let _ = sink_guard.send(Message::Pong(data)).await;
            }
            Ok(Message::Pong(_)) => {
                // Update activity timestamp on pong responses
                let mut peers_guard = peers.write().await;
                if let Some(peer) = peers_guard.get_mut(&addr) {
                    peer.last_activity = Instant::now();
                }
            }
            Ok(Message::Binary(_)) => {
                warn!("Received unsupported binary message from {}", addr);
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket connection closed by peer: {}", addr);
                break;
            }
            Err(e) => {
                warn!("WebSocket error from {}: {}", addr, e);
                break;
            }
            _ => {}
        }
    }

    // Clean up peer on disconnect
    let session_id_and_user = {
        let mut peers_guard = peers.write().await;
        if let Some(peer) = peers_guard.remove(&addr) {
            info!(
                "Peer disconnected: {} (user: {})",
                addr,
                if peer.user_id.is_empty() {
                    "unknown"
                } else {
                    &peer.user_id
                }
            );

            if peer.session_id.is_some() && !peer.user_id.is_empty() {
                Some((peer.session_id.clone(), peer.user_id.clone()))
            } else {
                None
            }
        } else {
            None
        }
    };

    // Notify room about user leaving (lock released above to avoid holding across broadcast)
    if let Some((Some(session_id), user_id)) = session_id_and_user {
        let leave_msg = CollabMessage::UserLeft {
            user_id: user_id.clone(),
        };

        let peers_guard = peers.read().await;
        broadcast_to_peers(&peers_guard, &session_id, &leave_msg, Some(addr));
        drop(peers_guard);

        let _ = app.emit(
            "collab:user-left",
            serde_json::json!({
                "sessionId": session_id,
                "userId": user_id,
            }),
        );

        // Clean up empty rooms after peer leaves
        cleanup_empty_rooms(&peers, &rooms).await;
    }

    Ok(())
}

/// Broadcast a message to all peers in a session, optionally excluding one address
fn broadcast_to_peers(
    peers: &HashMap<SocketAddr, PeerConnection>,
    session_id: &str,
    message: &CollabMessage,
    exclude: Option<SocketAddr>,
) {
    let msg_json = match serde_json::to_string(message) {
        Ok(json) => json,
        Err(e) => {
            warn!("Failed to serialize broadcast message: {}", e);
            return;
        }
    };

    for (peer_addr, peer) in peers.iter() {
        if peer.session_id.as_deref() == Some(session_id) {
            if let Some(ex) = exclude {
                if *peer_addr == ex {
                    continue;
                }
            }
            let sink = peer.sink.clone();
            let msg = msg_json.clone();
            tokio::spawn(async move {
                let mut sink = sink.lock().await;
                let _ = sink.send(Message::Text(msg)).await;
            });
        }
    }
}

/// Handle a parsed collaboration message
async fn handle_collab_message(
    message: &CollabMessage,
    addr: SocketAddr,
    peers: &Arc<RwLock<HashMap<SocketAddr, PeerConnection>>>,
    rooms: &Arc<RwLock<HashMap<String, RoomBroadcast>>>,
    sink: &Arc<TokioMutex<WsSink>>,
) {
    match message {
        CollabMessage::JoinRoom { session_id, user } => {
            // Update peer info
            {
                let mut peers_guard = peers.write().await;
                if let Some(peer) = peers_guard.get_mut(&addr) {
                    peer.user_id = user.id.clone();
                    peer.session_id = Some(session_id.clone());
                }
            }

            // Ensure room broadcast channel exists
            {
                let mut rooms_guard = rooms.write().await;
                rooms_guard.entry(session_id.clone()).or_insert_with(|| {
                    let (tx, _) = broadcast::channel(256);
                    RoomBroadcast { tx }
                });
            }

            // Broadcast user joined to other peers in the room
            let join_msg = CollabMessage::UserJoined { user: user.clone() };

            let peers_guard = peers.read().await;
            broadcast_to_peers(&peers_guard, session_id, &join_msg, Some(addr));

            info!(
                "User '{}' joined room '{}' from {}",
                user.name, session_id, addr
            );
        }

        CollabMessage::LeaveRoom {
            session_id,
            user_id,
        } => {
            // Update peer info
            {
                let mut peers_guard = peers.write().await;
                if let Some(peer) = peers_guard.get_mut(&addr) {
                    peer.session_id = None;
                }
            }

            // Broadcast user left
            let leave_msg = CollabMessage::UserLeft {
                user_id: user_id.clone(),
            };

            let peers_guard = peers.read().await;
            broadcast_to_peers(&peers_guard, session_id, &leave_msg, Some(addr));
            drop(peers_guard);

            // Clean up empty rooms after user leaves
            cleanup_empty_rooms(peers, rooms).await;
        }

        CollabMessage::CursorUpdate { .. }
        | CollabMessage::SelectionUpdate { .. }
        | CollabMessage::DocumentSync { .. }
        | CollabMessage::AwarenessUpdate { .. }
        | CollabMessage::ChatMessage { .. } => {
            // Forward to all peers in the same room (except sender)
            let session_id = {
                let peers_guard = peers.read().await;
                peers_guard.get(&addr).and_then(|p| p.session_id.clone())
            };

            if let Some(session_id) = session_id {
                let peers_guard = peers.read().await;
                broadcast_to_peers(&peers_guard, &session_id, message, Some(addr));
            }
        }

        CollabMessage::Ping => {
            let pong = CollabMessage::Pong;
            if let Ok(json) = serde_json::to_string(&pong) {
                let mut sink_guard = sink.lock().await;
                let _ = sink_guard.send(Message::Text(json)).await;
            }
        }

        _ => {}
    }
}
