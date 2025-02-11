import java.io.*;
import java.net.*;
import java.util.concurrent.ConcurrentHashMap;

public class GameSocketServer {
    private static final int PORT = 12345; // Define the port
    private static ConcurrentHashMap<String, PrintWriter> clients = new ConcurrentHashMap<>();

    public static void main(String[] args) {
        System.out.println("Starting the server...");

        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println("Server started on port " + PORT);

            while (true) {
                Socket clientSocket = serverSocket.accept();
                System.out.println("Client connected: " + clientSocket.getInetAddress());

                new Thread(new ClientHandler(clientSocket)).start();
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    static class ClientHandler implements Runnable {
        private Socket socket;
        private String clientName;
        private PrintWriter out;
        private BufferedReader in;

        public ClientHandler(Socket socket) {
            this.socket = socket;
        }

        @Override
        public void run() {
            try {
                // Setup streams
                in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                out = new PrintWriter(socket.getOutputStream(), true);

                // Add the client to the clients map
                clientName = socket.getInetAddress().getHostName();
                clients.put(clientName, out);

                String message;
                while ((message = in.readLine()) != null) {
                    System.out.println("Received: " + message);
                    broadcast(message, clientName);
                }
            } catch (IOException e) {
                System.err.println("Connection error with client: " + clientName);
            } finally {
                // Cleanup
                try {
                    clients.remove(clientName);
                    socket.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }

        private void broadcast(String message, String sender) {
            for (String client : clients.keySet()) {
                if (!client.equals(sender)) {
                    clients.get(client).println(message);
                }
            }
        }
    }
}