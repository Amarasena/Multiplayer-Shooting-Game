package socket;

import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Base64;

public class WebSocketServer {
    private static final int PORT = 12345;

    public static void main(String[] args) {
        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println("WebSocket Server started on port " + PORT);

            while (true) {
                Socket clientSocket = serverSocket.accept();
                System.out.println("Client connected: " + clientSocket.getInetAddress());

                handleClient(clientSocket);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static void handleClient(Socket clientSocket) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
             OutputStream outputStream = clientSocket.getOutputStream()) {

            // Read HTTP headers from client
            String line;
            String webSocketKey = null;
            while (!(line = reader.readLine()).isEmpty()) {
                if (line.startsWith("Sec-WebSocket-Key: ")) {
                    webSocketKey = line.substring(19);
                }
            }

            if (webSocketKey == null) {
                System.out.println("Invalid WebSocket request.");
                return;
            }

            // Generate WebSocket accept key
            String acceptKey = generateAcceptKey(webSocketKey);
            String response =
                    "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";

            outputStream.write(response.getBytes());
            outputStream.flush();
            System.out.println("Handshake completed. WebSocket connection established!");

            // Handle WebSocket messages (simple echo server)
            while (true) {
                int firstByte = clientSocket.getInputStream().read();
                if (firstByte == -1) break; // Connection closed

                int payloadLength = clientSocket.getInputStream().read() & 127;
                byte[] maskedData = new byte[payloadLength + 4];
                clientSocket.getInputStream().read(maskedData);

                // Extract mask key
                byte[] maskKey = new byte[4];
                System.arraycopy(maskedData, 0, maskKey, 0, 4);

                // Decode payload
                byte[] decodedData = new byte[payloadLength];
                for (int i = 0; i < payloadLength; i++) {
                    decodedData[i] = (byte) (maskedData[i + 4] ^ maskKey[i % 4]);
                }

                String message = new String(decodedData);
                System.out.println("Received: " + message);

                // Send response
                sendWebSocketMessage(outputStream, "Echo: " + message);
            }

        } catch (IOException e) {
            System.out.println("Client disconnected.");
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
        outputStream.write(129); // Text frame opcode
        outputStream.write(messageBytes.length);
        outputStream.write(messageBytes);
        outputStream.flush();
    }
}
