// server.js - Discord Webhook Integration Server
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const serviceAccount = require('./path/to/your/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chatting-6cd81-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Discord Configuration
const DISCORD_WEBHOOK_URL = '0iMBhciGjbW_ztIMzK4xtq6MJ58OOnjnJSY8UJJWpHG0L7ifnU3AQa51oVHb5HvouUJm';
const DISCORD_BOT_TOKEN = 'd1019f99375c4acd058f048884f6f2a297c3f3525d3afb1f3ef57a0427bcee97';
const DISCORD_CHANNEL_ID = '1412918932309803201';

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

    let webhookData = {
      username: 'Pleb Chat',
      avatar_url: 'https://cdn.discordapp.com/emojis/your_emoji_id.png', // Optional custom avatar
      content: `-=${name}=-\n${text || ''}`
    };

    // Handle image data
    if (imageData) {
      // If it's a base64 image, you'd need to upload it somewhere first
      // For now, we'll just mention there's an image
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
      isDiscord: true, // Special flag for Discord messages
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server running', discord: client.isReady() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login Discord bot
client.login(DISCORD_BOT_TOKEN);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});
