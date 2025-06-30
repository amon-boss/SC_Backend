const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Service = require('../models/Service');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation pour la mise à jour du profil
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Format de téléphone invalide'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La bio ne peut pas dépasser 500 caractères'),
  
  body('type')
    .optional()
    .isIn(['particulier', 'prestataire'])
    .withMessage('Le type doit être "particulier" ou "prestataire"')
];

// Route pour obtenir le profil utilisateur
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Compter les services si c'est un prestataire
    let servicesCount = 0;
    if (user.type === 'prestataire') {
      servicesCount = await Service.countDocuments({ 
        userId: user._id, 
        isActive: true 
      });
    }

    res.json({
      success: true,
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
        ratingCount: user.ratingCount,
        servicesCount,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour mettre à jour le profil
router.put('/profile', authenticateToken, updateProfileValidation, async (req, res) => {
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

    const { firstName, lastName, phone, bio, type } = req.body;
    const userId = req.user._id;

    // Vérifier si le téléphone n'est pas déjà utilisé par un autre utilisateur
    if (phone && phone !== req.user.phone) {
      const existingUser = await User.findOne({ 
        phone, 
        _id: { $ne: userId } 
      });
      
      if (existingUser) {
        return res.status(409).json({
          error: true,
          message: 'Ce numéro de téléphone est déjà utilisé'
        });
      }
    }

    // Construire l'objet de mise à jour
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (type !== undefined) updateData.type = type;

    // Mettre à jour l'utilisateur
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        error: true,
        message: 'Utilisateur non trouvé'
      });
    }

    // Si le type a changé et que l'utilisateur devient particulier,
    // désactiver tous ses services
    if (type === 'particulier' && req.user.type === 'prestataire') {
      await Service.updateMany(
        { userId },
        { isActive: false }
      );
    }

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: {
        id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        type: updatedUser.type,
        fullName: updatedUser.fullName,
        initials: updatedUser.initials,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
        rating: updatedUser.rating,
        ratingCount: updatedUser.ratingCount
      }
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    
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

// Route pour changer le mot de passe
router.put('/change-password', authenticateToken, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Le mot de passe actuel est obligatoire'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
], async (req, res) => {
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

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    // Vérifier le mot de passe actuel
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        error: true,
        message: 'Mot de passe actuel incorrect'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe mis à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour supprimer le compte
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    // Désactiver l'utilisateur au lieu de le supprimer
    await User.findByIdAndUpdate(userId, { isActive: false });

    // Désactiver tous ses services
    await Service.updateMany(
      { userId },
      { isActive: false }
    );

    res.json({
      success: true,
      message: 'Compte supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour rechercher des utilisateurs (pour admin ou fonctionnalités futures)
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, type, limit = 10, page = 1 } = req.query;
    
    const searchCriteria = { isActive: true };
    
    if (q) {
      searchCriteria.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (type) {
      searchCriteria.type = type;
    }

    const skip = (page - 1) * limit;
    
    const users = await User.find(searchCriteria)
      .select('firstName lastName phone type rating ratingCount avatar')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(searchCriteria);

    res.json({
      success: true,
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: users.length,
        totalItems: total
      }
    });

  } catch (error) {
    console.error('Erreur lors de la recherche d\'utilisateurs:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir les statistiques utilisateur
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const stats = {
      servicesPosted: 0,
      totalViews: 0,
      totalRequests: 0,
      averageRating: req.user.rating || 0
    };

    if (req.user.type === 'prestataire') {
      const services = await Service.find({ userId, isActive: true });
      
      stats.servicesPosted = services.length;
      stats.totalViews = services.reduce((sum, service) => sum + service.views, 0);
      stats.totalRequests = services.reduce((sum, service) => sum + service.requests, 0);
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;
