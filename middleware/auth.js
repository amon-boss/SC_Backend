const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'service-connect-secret-key-2025';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Middleware d'authentification
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: true,
        message: 'Token d\'accès requis'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        error: true,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: true,
        message: 'Compte désactivé'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: true,
        message: 'Token invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: true,
        message: 'Token expiré'
      });
    }

    console.error('Erreur d\'authentification:', error);
    return res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
};

// Middleware pour vérifier le type d'utilisateur
const requireUserType = (requiredType) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: true,
        message: 'Authentification requise'
      });
    }

    if (req.user.type !== requiredType) {
      return res.status(403).json({
        error: true,
        message: `Accès réservé aux ${requiredType}s`
      });
    }

    next();
  };
};

// Middleware pour vérifier que l'utilisateur peut modifier une ressource
const requireOwnership = (Model, param = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[param];
      const resource = await Model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          error: true,
          message: 'Ressource non trouvée'
        });
      }

      if (resource.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: true,
          message: 'Vous n\'avez pas les droits pour modifier cette ressource'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Erreur de vérification de propriété:', error);
      return res.status(500).json({
        error: true,
        message: 'Erreur interne du serveur'
      });
    }
  };
};

// Fonction pour générer un token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Fonction pour décoder un token sans vérification (pour debug)
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

// Middleware optionnel d'authentification (ne bloque pas si pas de token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // En cas d'erreur, on continue sans authentification
    next();
  }
};

module.exports = {
  authenticateToken,
  requireUserType,
  requireOwnership,
  generateToken,
  decodeToken,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
