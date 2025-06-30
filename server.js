const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middlewares de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limite chaque IP à 1000 requêtes par fenêtre
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://uy0z407vh8.space.minimax.io', 'https://service-connect-frontend.onrender.com']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://kevy:Jmusiala42@cluster0.0tgdjcz.mongodb.net/confessy?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connexion à MongoDB réussie');
})
.catch((error) => {
  console.error('❌ Erreur de connexion à MongoDB:', error);
  process.exit(1);
});

// Import des routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const messageRoutes = require('./routes/messages');

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/messages', messageRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Service Connect API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Route par défaut
app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l\'API Service Connect',
    documentation: '/api/health',
    status: 'Service en ligne'
  });
});

// Middleware de gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  
  const status = error.status || 500;
  const message = error.message || 'Erreur interne du serveur';
  
  res.status(status).json({
    error: true,
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Middleware pour les routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({
    error: true,
    message: 'Route non trouvée',
    path: req.originalUrl
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Serveur Service Connect démarré sur le port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
});

// Gestion graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Signal SIGTERM reçu. Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('🔌 Connexion MongoDB fermée.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Signal SIGINT reçu. Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('🔌 Connexion MongoDB fermée.');
    process.exit(0);
  });
});

module.exports = app;
