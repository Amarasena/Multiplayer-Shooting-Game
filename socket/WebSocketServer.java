//socket/WebSocketServer.java
package socket;

import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Base64;
import org.json.JSONObject;
import org.json.JSONArray;

public class WebSocketServer {
    private static final int PORT = 12345;
    private static final Map<Socket, String> players = new ConcurrentHashMap<>();

    public static void main(String[] args) {
        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println("WebSocket Server started on port " + PORT);

            while (true) {
                Socket clientSocket = serverSocket.accept();
                System.out.println("Client connected: " + clientSocket.getInetAddress());

                new Thread(() -> handleClient(clientSocket)).start();
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static void handleClient(Socket clientSocket) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
             OutputStream outputStream = clientSocket.getOutputStream()) {

            String playerId = UUID.randomUUID().toString();
            players.put(clientSocket, playerId);
            System.out.println("New player joined: " + playerId);

            sendPlayerListToAll();

            // WebSocket handshake
            String webSocketKey = null;
            String line;
            while (!(line = reader.readLine()).isEmpty()) {
                if (line.startsWith("Sec-WebSocket-Key: ")) {
                    webSocketKey = line.substring(19).trim();
                }
            }

            if (webSocketKey == null) {
                System.out.println("Invalid WebSocket request.");
                clientSocket.close();
                return;
            }

            String acceptKey = generateAcceptKey(webSocketKey);
            String response = "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";

            outputStream.write(response.getBytes());
            outputStream.flush();
            System.out.println("Handshake completed. WebSocket connection established!");

            // Handle messages
            while (true) {
                String message = readWebSocketMessage(clientSocket);
                if (message == null) {
                    handleDisconnection(clientSocket);
                    break;
                }

                System.out.println("Received: " + message);

                // Parse the JSON message
                JSONObject json = new JSONObject(message);
                String type = json.getString("type");

                if (type.equals("movement")) {
                    String movingPlayerId = json.getString("playerId");
                    JSONObject position = json.getJSONObject("position");

                    // Broadcast the movement update to all clients
                    JSONObject movementUpdate = new JSONObject();
                    movementUpdate.put("type", "movement");
                    movementUpdate.put("playerId", movingPlayerId);
                    movementUpdate.put("position", position);

                    broadcastMessage(movementUpdate.toString());
                }
            }
        } catch (IOException e) {
            handleDisconnection(clientSocket);
        }
    }

    private static void broadcastMessage(String message) {
        for (Socket client : players.keySet()) {
            try {
                sendWebSocketMessage(client.getOutputStream(), message);
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    private static void sendPlayerListToAll() {
        JSONArray playerArray = new JSONArray(players.values());

        JSONObject json = new JSONObject();
        json.put("type", "playerList");
        json.put("players", playerArray);

        broadcastMessage(json.toString());
    }

    private static void handleDisconnection(Socket clientSocket) {
        if (players.containsKey(clientSocket)) {
            String playerId = players.remove(clientSocket);
            System.out.println("Player disconnected: " + playerId);
            sendPlayerListToAll();
        }

        try {
            clientSocket.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static String generateAcceptKey(String key) {
        try {
            String magicString = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] hashed = md.digest(magicString.getBytes());
            return Base64.getEncoder().encodeToString(hashed);
        } catch (Exception e) {
            throw new RuntimeException("Error generating WebSocket key", e);
        }
    }

    private static void sendWebSocketMessage(OutputStream outputStream, String message) throws IOException {
        byte[] messageBytes = message.getBytes();
        int messageLength = messageBytes.length;

        ByteArrayOutputStream frame = new ByteArrayOutputStream();
        frame.write(129); // 0x81 (FIN bit + Text frame opcode)

        if (messageLength <= 125) {
            frame.write(messageLength);
        } else if (messageLength <= 65535) {
            frame.write(126);
            frame.write((messageLength >> 8) & 0xFF);
            frame.write(messageLength & 0xFF);
        } else {
            frame.write(127);
            for (int i = 7; i >= 0; i--) {
                frame.write((messageLength >> (i * 8)) & 0xFF);
            }
        }

        frame.write(messageBytes);
        outputStream.write(frame.toByteArray());
        outputStream.flush();
    }

    private static String readWebSocketMessage(Socket socket) throws IOException {
        InputStream inputStream = socket.getInputStream();
        int firstByte = inputStream.read();
        if (firstByte == -1) {
            return null;
        }

        int payloadLength = inputStream.read() & 0x7F;
        if (payloadLength == 126) {
            payloadLength = ((inputStream.read() & 0xFF) << 8) | (inputStream.read() & 0xFF);
        } else if (payloadLength == 127) {
            for (int i = 0; i < 6; i++) {
                inputStream.read(); // Ignore leading bytes for simplicity
            }
            payloadLength = ((inputStream.read() & 0xFF) << 8) | (inputStream.read() & 0xFF);
        }

        byte[] mask = new byte[4];
        inputStream.read(mask, 0, 4);

        byte[] encodedMessage = new byte[payloadLength];
        inputStream.read(encodedMessage, 0, payloadLength);

        for (int i = 0; i < payloadLength; i++) {
            encodedMessage[i] ^= mask[i % 4]; // Unmasking
        }

        return new String(encodedMessage);
    }
}
