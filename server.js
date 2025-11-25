const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
// Ping endpoint for monitoring services
app.get('/api/ping', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

app.head('/api/ping', (req, res) => {
  res.status(200).end();
});

// CORS Configuration
const allowedOrigins = [
    'https://krptrips.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5500',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8080',
    'null' // file:// origin
];

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB Connection
console.log('Attempting to connect to MongoDB...');
console.log('MongoDB URI:', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/share-it', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Successfully connected to MongoDB!');
  
  // Fix Family collection indexes - drop old name-only index if it exists
  try {
    const Family = require('./models/Family');
    const collection = Family.collection;
    
    // Get all indexes
    const indexes = await collection.indexes();
    
    // Find and drop any index that only has 'name' field (old unique constraint)
    for (const idx of indexes) {
      const keys = idx.key || {};
      const keyNames = Object.keys(keys);
      
      // Check if this is an index with only 'name' field (not the compound index)
      if (keyNames.length === 1 && keyNames[0] === 'name' && keys.name === 1) {
        const indexName = idx.name;
        // Skip _id index
        if (indexName !== '_id_') {
          console.log(`Dropping old name-only index "${indexName}" from families collection...`);
          try {
            await collection.dropIndex(indexName);
            console.log(`Index "${indexName}" dropped successfully.`);
          } catch (dropError) {
            console.warn(`Could not drop index "${indexName}":`, dropError.message);
          }
        }
      }
    }
    
    // Ensure compound index exists (Mongoose should create it, but we'll sync to be sure)
    await Family.syncIndexes();
    console.log('Family indexes synced successfully.');
  } catch (error) {
    console.error('Error fixing Family indexes:', error);
    // Don't fail startup if index fix fails
  }
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
});



// Config endpoint - serves API URL from environment
app.get('/api/config', (req, res) => {
  res.json({
    apiUrl: process.env.API_URL || 'http://localhost:5000/api',
    remoteApiUrl: process.env.REMOTE_API_URL || 'https://share-it-backend.onrender.com/api',
    localApiUrl: process.env.LOCAL_API_URL || 'http://localhost:5000/api'
  });
});

// Routes
app.use('/api/groups', require('./routes/groups'));
app.use('/api/families', require('./routes/families'));
app.use('/api/expenses', require('./routes/expenses'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 