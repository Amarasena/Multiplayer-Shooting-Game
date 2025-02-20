// socket/src/main/java/socket/WebSocketServer.java
package socket;

import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import org.json.JSONObject;
import org.json.JSONArray;

public class WebSocketServer {
    private static final int PORT = 9090;
    private static final Map<String, Socket> players = new ConcurrentHashMap<>();
    private static final Map<String, Map<String, Boolean>> playerMovements = new ConcurrentHashMap<>();
    private static final Map<String, double[]> playerRotations = new ConcurrentHashMap<>();
    private static final Map<String, double[]> playerPositions = new ConcurrentHashMap<>();


    public static void main(String[] args) {
        System.out.println("Socket is starting");
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
        try (
                BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
                OutputStream outputStream = clientSocket.getOutputStream()) {
            String webSocketKey = null;
            String line;

            // Read the handshake request properly
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.startsWith("Sec-WebSocket-Key: ")) {
                    webSocketKey = line.substring(19).trim();
                }
            }

            if (webSocketKey == null) {
                System.out.println("Invalid WebSocket request. Closing connection.");
                clientSocket.close();
                return;
            }

            // Respond with proper WebSocket handshake
            String acceptKey = generateAcceptKey(webSocketKey);
            String response = "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";

            outputStream.write(response.getBytes());
            outputStream.flush();

            System.out.println("Handshake completed. WebSocket connection established!");

            // Generate and store playerId
            String playerId = UUID.randomUUID().toString();
            players.put(playerId, clientSocket);
            playerMovements.put(playerId, new HashMap<>());
            System.out.println("New player joined: " + playerId);

            // Send the assigned playerId to the client after handshake
            JSONObject initMessage = new JSONObject();
            initMessage.put("type", "init");
            initMessage.put("playerId", playerId);
            sendWebSocketMessage(outputStream, initMessage.toString());

            sendPlayerListToAll();

            // Keep listening for messages
            while (true) {
                String message = readWebSocketMessage(clientSocket);
                if (message == null) {
                    handleDisconnection(clientSocket);
                    break;
                }
                //System.out.println("Received: " + message);
                handlePlayerMovement(message, playerId);
            }
        } catch (IOException e) {
            handleDisconnection(clientSocket);
        }
    }

    private static void handlePlayerMovement(String message, String playerId) {
        JSONObject jsonMessage = new JSONObject(message);
        
        if ("playerMovement".equals(jsonMessage.getString("type"))) {
    
            // Extract the "playerMovement" object
            JSONObject playerMovementJson = jsonMessage.getJSONObject("playerMovement");
    
            // Extract movement controls if present
            Map<String, Boolean> movement = new HashMap<>();
            if (playerMovementJson.has("movement")) {
                JSONObject movementJson = playerMovementJson.getJSONObject("movement");
                for (String key : movementJson.keySet()) {
                    movement.put(key, movementJson.getBoolean(key));
                }
                // Update player movement information
                playerMovements.get(playerId).putAll(movement);
            }
    
            // Extract rotation if present
            if (playerMovementJson.has("rotation")) {
                JSONObject rotationJson = playerMovementJson.getJSONObject("rotation");
                double pitch = rotationJson.getDouble("pitch");
                double yaw = rotationJson.getDouble("yaw");
    
                // Store rotation (assuming you have a rotation data structure)
                playerRotations.put(playerId, new double[]{pitch, yaw});
            }
    
            // Extract position if present
            if (jsonMessage.has("position")) {
                JSONArray positionArray = jsonMessage.getJSONArray("position");
                double x = positionArray.getDouble(0);
                double y = positionArray.getDouble(1);
                double z = positionArray.getDouble(2);
    
                // Store player position
                playerPositions.put(playerId, new double[]{x, y, z});
            }
    
            // Broadcast updated movement, rotation, and position
            broadcastPlayerUpdate(playerId, playerMovements.get(playerId), playerRotations.get(playerId), playerPositions.get(playerId));
        }
    }

    private static void broadcastPlayerUpdate(String playerId, Map<String, Boolean> movement, double[] rotation, double[] position) {
        JSONObject json = new JSONObject();
        json.put("type", "playerUpdate");
        json.put("playerId", playerId);
        json.put("playerMovement", new JSONObject(movement));
    
        if (rotation != null) {
            JSONObject rotationJson = new JSONObject();
            rotationJson.put("pitch", rotation[0]);
            rotationJson.put("yaw", rotation[1]);
            json.put("rotation", rotationJson);
        }
    
        if (position != null) {
            JSONArray positionJson = new JSONArray();
            positionJson.put(position[0]);
            positionJson.put(position[1]);
            positionJson.put(position[2]);
            json.put("position", positionJson);
        }
    
        broadcastMessage(json.toString());
    }
    
    

    private static void broadcastPlayerUpdate(String playerId, Map<String, Boolean> movement) {
        JSONObject json = new JSONObject();
        json.put("type", "playerUpdate");
        json.put("playerId", playerId);
        json.put("playerMovement", new JSONObject(movement));

        broadcastMessage(json.toString());
    }

    private static void broadcastMessage(String message) {
        for (Socket client : players.values()) {
            try {
                sendWebSocketMessage(client.getOutputStream(), message);
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    private static void sendPlayerListToAll() {
        JSONArray playerArray = new JSONArray(players.keySet());

        JSONObject json = new JSONObject();
        json.put("type", "playerList");
        json.put("players", playerArray);

        broadcastMessage(json.toString());
    }

    private static void handleDisconnection(Socket clientSocket) {
        String disconnectedPlayerId = null;
        for (Map.Entry<String, Socket> entry : players.entrySet()) {
            if (entry.getValue().equals(clientSocket)) {
                disconnectedPlayerId = entry.getKey();
                break;
            }
        }

        if (disconnectedPlayerId != null) {
            players.remove(disconnectedPlayerId);
            playerMovements.remove(disconnectedPlayerId);
            System.out.println("Player disconnected: " + disconnectedPlayerId);
            sendPlayerListToAll();
        }

        try {
            clientSocket.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    // This is for generating the key
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
            return null; // Connection closed
        }

        int opcode = firstByte & 0x0F;
        if (opcode == 0x8) {
            System.out.println("Received Close Frame. Client is disconnecting...");
            return null; // Handle WebSocket close frame
        }

        int payloadLength = inputStream.read() & 0x7F;
        if (payloadLength == 126) {
            payloadLength = ((inputStream.read() & 0xFF) << 8) | (inputStream.read() & 0xFF);
        } else if (payloadLength == 127) {
            for (int i = 0; i < 6; i++) {
                inputStream.read(); // Ignore leading bytes
            }
            payloadLength = ((inputStream.read() & 0xFF) << 8) | (inputStream.read() & 0xFF);
        }

        byte[] mask = new byte[4];
        int maskRead = inputStream.read(mask, 0, 4);
        if (maskRead < 4) {
            return null; // Prevent crash if mask is incomplete
        }

        byte[] encodedMessage = new byte[payloadLength];
        int bytesRead = inputStream.read(encodedMessage, 0, payloadLength);
        if (bytesRead < payloadLength) {
            return null; // Prevent crash if message is incomplete
        }

        for (int i = 0; i < payloadLength; i++) {
            encodedMessage[i] ^= mask[i % 4]; // Unmasking
        }

        return new String(encodedMessage);
    }
}
