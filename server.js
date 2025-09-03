const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');
const admin = require('firebase-admin');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: '*', // In production, specify your actual domains
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Firebase Admin with environment variables
const serviceAccountKey = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

const db = admin.database();

// Discord Configuration from environment variables
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// Initialize Discord Bot
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

// Send message from chat app to Discord
app.post('/send-to-discord', async (req, res) => {
  try {
    const { name, text, imageData } = req.body;
    
    if (!name || (!text && !imageData)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!DISCORD_WEBHOOK_URL) {
      return res.status(500).json({ error: 'Discord webhook not configured' });
    }

    let webhookData = {
      username: 'Pleb Chat',
      content: `-=${name}=-\n${text || ''}`
    };

    // Handle image data
    if (imageData) {
      if (text) {
        webhookData.content += '\n📸 *[Image attached]*';
      } else {
        webhookData.content = `-=${name}=-\n📸 *[Image]*`;
      }
    }

    const response = await axios.post(DISCORD_WEBHOOK_URL, webhookData);
    
    res.json({ success: true, message: 'Message sent to Discord' });
  } catch (error) {
    console.error('Error sending to Discord:', error);
    res.status(500).json({ error: 'Failed to send message to Discord' });
  }
});

// Discord bot event handlers
client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  // Ignore messages from bots and messages not in the target channel
  if (message.author.bot || message.channel.id !== DISCORD_CHANNEL_ID) {
    return;
  }

  try {
    // Send Discord message to Firebase
    const messageData = {
      name: message.author.displayName || message.author.username,
      text: message.content,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      isDiscord: true,
      discordAvatar: message.author.displayAvatarURL()
    };

    // Handle attachments (images)
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first();
      if (attachment.contentType?.startsWith('image/')) {
        messageData.imageData = attachment.url;
      }
    }

    // Push to Firebase
    await db.ref('messages').push(messageData);
    
    console.log(`Forwarded Discord message from ${message.author.username}: ${message.content}`);
  } catch (error) {
    console.error('Error forwarding Discord message:', error);
  }
});

// Health check endpoint with detailed info
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server running', 
    discord: client.isReady(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: {
      hasDiscordToken: !!DISCORD_BOT_TOKEN,
      hasWebhookUrl: !!DISCORD_WEBHOOK_URL,
      hasChannelId: !!DISCORD_CHANNEL_ID,
      hasFirebaseProject: !!process.env.FIREBASE_PROJECT_ID
    }
  });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'CORS test successful!', 
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Pleb Chat Discord Integration Server', 
    status: 'Running',
    discord: client.isReady(),
    endpoints: ['/health', '/send-to-discord', '/test'],
    cors: 'enabled'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Login Discord bot
if (DISCORD_BOT_TOKEN) {
  client.login(DISCORD_BOT_TOKEN).catch(console.error);
} else {
  console.error('Discord bot token not found! Set DISCORD_BOT_TOKEN environment variable.');
}

// Handle graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    client.destroy();
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
