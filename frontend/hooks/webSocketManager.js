//frontend/hooks/webSocketManager.js
class WebSocketManager {
    constructor() {
        if (!WebSocketManager.instance) {
            this.socket = null;
            WebSocketManager.instance = this;
        }
        return WebSocketManager.instance;
    }

    connect(url) {
        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
            this.socket = new WebSocket(url);

            this.socket.onopen = () => console.log("WebSocket connected");
            this.socket.onclose = () => console.log("WebSocket disconnected");
            this.socket.onerror = (error) => console.error("WebSocket error:", error);
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    getSocket() {
        return this.socket;
    }
}

const webSocketManager = new WebSocketManager();
export default webSocketManager;
