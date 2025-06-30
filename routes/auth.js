const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation pour l'inscription
const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('Le prénom est obligatoire')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Le nom est obligatoire')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone est obligatoire')
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Format de téléphone invalide'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  
  body('type')
    .isIn(['particulier', 'prestataire'])
    .withMessage('Le type doit être "particulier" ou "prestataire"'),
  
  body('acceptPolicy')
    .equals('true')
    .withMessage('Vous devez accepter la politique d\'utilisation')
];

// Validation pour la connexion
const loginValidation = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone ou nom est obligatoire'),
  
  body('password')
    .notEmpty()
    .withMessage('Le mot de passe est obligatoire')
];

// Route d'inscription
router.post('/register', registerValidation, async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: 'Données invalides',
        details: errors.array()
      });
    }

    const { firstName, lastName, phone, password, type } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({
        error: true,
        message: 'Un compte avec ce numéro de téléphone existe déjà'
      });
    }

    // Créer le nouvel utilisateur
    const user = new User({
      firstName,
      lastName,
      phone,
      password,
      type
    });

    await user.save();

    // Générer le token
    const token = generateToken(user._id);

    // Mettre à jour la dernière connexion
    await user.updateLastLogin();

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        type: user.type,
        fullName: user.fullName,
        initials: user.initials
      },
      token
    });

  } catch (error) {
    console.error('Erreur d\'inscription:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: true,
        message: 'Données invalides',
        details: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route de connexion
router.post('/login', loginValidation, async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: 'Données invalides',
        details: errors.array()
      });
    }

    const { identifier, password, rememberMe } = req.body;

    // Chercher l'utilisateur par téléphone ou nom
    const user = await User.findByPhoneOrName(identifier);
    if (!user) {
      return res.status(401).json({
        error: true,
        message: 'Identifiants incorrects'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: true,
        message: 'Identifiants incorrects'
      });
    }

    // Générer le token avec durée adaptée
    const tokenExpiry = rememberMe ? '30d' : '7d';
    const token = generateToken(user._id);

    // Mettre à jour la dernière connexion
    await user.updateLastLogin();

    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        type: user.type,
        fullName: user.fullName,
        initials: user.initials,
        avatar: user.avatar,
        bio: user.bio,
        rating: user.rating,
        ratingCount: user.ratingCount
      },
      token
    });

  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour vérifier le token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        phone: req.user.phone,
        type: req.user.type,
        fullName: req.user.fullName,
        initials: req.user.initials,
        avatar: req.user.avatar,
        bio: req.user.bio,
        rating: req.user.rating,
        ratingCount: req.user.ratingCount
      }
    });
  } catch (error) {
    console.error('Erreur de vérification du token:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route de déconnexion (côté client principalement)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Ici on pourrait invalider le token en le stockant dans une blacklist
    // Pour l'instant, on se contente de répondre success
    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('Erreur de déconnexion:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour réinitialiser le mot de passe (future implémentation)
router.post('/forgot-password', async (req, res) => {
  res.status(501).json({
    error: true,
    message: 'Fonctionnalité en cours de développement'
  });
});

module.exports = router;
