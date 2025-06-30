const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Service = require('../models/Service');
const User = require('../models/User');
const { authenticateToken, requireUserType, requireOwnership } = require('../middleware/auth');

const router = express.Router();

// Validation pour créer/modifier un service
const serviceValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Le titre est obligatoire')
    .isLength({ min: 5, max: 100 })
    .withMessage('Le titre doit contenir entre 5 et 100 caractères'),
  
  body('content')
    .trim()
    .notEmpty()
    .withMessage('La description est obligatoire')
    .isLength({ min: 10, max: 1000 })
    .withMessage('La description doit contenir entre 10 et 1000 caractères'),
  
  body('category')
    .notEmpty()
    .withMessage('La catégorie est obligatoire')
    .isIn([
      'Bricolage', 'Ménage', 'Jardinage', 'Informatique', 
      'Déménagement', 'Électricité', 'Plomberie', 'Peinture', 
      'Cuisine', 'Mécanique', 'Autres'
    ])
    .withMessage('Catégorie invalide'),
  
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le prix doit être un nombre positif'),
  
  body('priceType')
    .optional()
    .isIn(['heure', 'jour', 'fixe', 'negociable'])
    .withMessage('Type de prix invalide'),
  
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La localisation ne peut pas dépasser 200 caractères'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Les tags doivent être un tableau'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Chaque tag ne peut pas dépasser 30 caractères')
];

// Route pour obtenir tous les services (fil d'actualités)
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('sortBy').optional().isIn(['createdAt', 'views', 'rating', 'price']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: 'Paramètres invalides',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les critères de recherche
    const searchCriteria = { isActive: true };

    if (category && category !== 'Tous') {
      searchCriteria.category = category;
    }

    if (search) {
      searchCriteria.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Construire l'ordre de tri
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    // Récupérer les services
    const services = await Service.find(searchCriteria)
      .populate('userId', 'firstName lastName rating ratingCount avatar')
      .sort(sortOptions)
      .limit(limit)
      .skip(skip);

    // Compter le total pour la pagination
    const total = await Service.countDocuments(searchCriteria);

    // Formatter les résultats
    const formattedServices = services.map(service => ({
      id: service._id,
      title: service.title,
      content: service.content,
      category: service.category,
      price: service.price,
      priceType: service.priceType,
      location: service.location,
      userName: service.userName,
      userType: service.userType,
      userId: service.userId._id,
      userDetails: {
        fullName: `${service.userId.firstName} ${service.userId.lastName}`,
        rating: service.userId.rating,
        ratingCount: service.userId.ratingCount,
        avatar: service.userId.avatar
      },
      images: service.images,
      tags: service.tags,
      views: service.views,
      requests: service.requests,
      rating: service.rating,
      ratingCount: service.ratingCount,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    }));

    res.json({
      success: true,
      services: formattedServices,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: services.length,
        totalItems: total
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des services:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir un service spécifique
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('userId', 'firstName lastName rating ratingCount avatar bio');

    if (!service || !service.isActive) {
      return res.status(404).json({
        error: true,
        message: 'Service non trouvé'
      });
    }

    // Incrémenter les vues
    await service.incrementViews();

    res.json({
      success: true,
      service: {
        id: service._id,
        title: service.title,
        content: service.content,
        category: service.category,
        price: service.price,
        priceType: service.priceType,
        location: service.location,
        userName: service.userName,
        userType: service.userType,
        userId: service.userId._id,
        userDetails: {
          fullName: `${service.userId.firstName} ${service.userId.lastName}`,
          rating: service.userId.rating,
          ratingCount: service.userId.ratingCount,
          avatar: service.userId.avatar,
          bio: service.userId.bio
        },
        images: service.images,
        tags: service.tags,
        views: service.views,
        requests: service.requests,
        rating: service.rating,
        ratingCount: service.ratingCount,
        availableFrom: service.availableFrom,
        availableTo: service.availableTo,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du service:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour créer un nouveau service
router.post('/', authenticateToken, requireUserType('prestataire'), serviceValidation, async (req, res) => {
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

    const {
      title,
      content,
      category,
      price,
      priceType,
      location,
      tags,
      images,
      availableFrom,
      availableTo
    } = req.body;

    // Créer le nouveau service
    const service = new Service({
      title,
      content,
      category,
      price,
      priceType,
      location,
      tags: tags || [],
      images: images || [],
      availableFrom,
      availableTo,
      userId: req.user._id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userType: req.user.type
    });

    await service.save();

    // Populer les informations utilisateur
    await service.populate('userId', 'firstName lastName rating ratingCount avatar');

    res.status(201).json({
      success: true,
      message: 'Service créé avec succès',
      service: {
        id: service._id,
        title: service.title,
        content: service.content,
        category: service.category,
        price: service.price,
        priceType: service.priceType,
        location: service.location,
        userName: service.userName,
        userType: service.userType,
        userId: service.userId._id,
        userDetails: {
          fullName: `${service.userId.firstName} ${service.userId.lastName}`,
          rating: service.userId.rating,
          ratingCount: service.userId.ratingCount,
          avatar: service.userId.avatar
        },
        images: service.images,
        tags: service.tags,
        views: service.views,
        requests: service.requests,
        createdAt: service.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur lors de la création du service:', error);
    
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

// Route pour modifier un service
router.put('/:id', authenticateToken, requireOwnership(Service), serviceValidation, async (req, res) => {
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

    const {
      title,
      content,
      category,
      price,
      priceType,
      location,
      tags,
      images,
      availableFrom,
      availableTo
    } = req.body;

    // Mettre à jour le service
    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        category,
        price,
        priceType,
        location,
        tags: tags || [],
        images: images || [],
        availableFrom,
        availableTo
      },
      { new: true, runValidators: true }
    ).populate('userId', 'firstName lastName rating ratingCount avatar');

    res.json({
      success: true,
      message: 'Service modifié avec succès',
      service: {
        id: updatedService._id,
        title: updatedService.title,
        content: updatedService.content,
        category: updatedService.category,
        price: updatedService.price,
        priceType: updatedService.priceType,
        location: updatedService.location,
        userName: updatedService.userName,
        userType: updatedService.userType,
        userId: updatedService.userId._id,
        userDetails: {
          fullName: `${updatedService.userId.firstName} ${updatedService.userId.lastName}`,
          rating: updatedService.userId.rating,
          ratingCount: updatedService.userId.ratingCount,
          avatar: updatedService.userId.avatar
        },
        images: updatedService.images,
        tags: updatedService.tags,
        views: updatedService.views,
        requests: updatedService.requests,
        createdAt: updatedService.createdAt,
        updatedAt: updatedService.updatedAt
      }
    });

  } catch (error) {
    console.error('Erreur lors de la modification du service:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour supprimer un service
router.delete('/:id', authenticateToken, requireOwnership(Service), async (req, res) => {
  try {
    // Désactiver le service au lieu de le supprimer
    await Service.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({
      success: true,
      message: 'Service supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression du service:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir les services d'un utilisateur
router.get('/user/:userId', async (req, res) => {
  try {
    const services = await Service.getByUser(req.params.userId);

    const formattedServices = services.map(service => ({
      id: service._id,
      title: service.title,
      content: service.content,
      category: service.category,
      price: service.price,
      priceType: service.priceType,
      location: service.location,
      userName: service.userName,
      userType: service.userType,
      images: service.images,
      tags: service.tags,
      views: service.views,
      requests: service.requests,
      rating: service.rating,
      ratingCount: service.ratingCount,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    }));

    res.json({
      success: true,
      services: formattedServices
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des services utilisateur:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour faire une demande de service
router.post('/:id/request', authenticateToken, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('userId', 'firstName lastName');

    if (!service || !service.isActive) {
      return res.status(404).json({
        error: true,
        message: 'Service non trouvé'
      });
    }

    // Vérifier que l'utilisateur ne demande pas son propre service
    if (service.userId._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        error: true,
        message: 'Vous ne pouvez pas demander votre propre service'
      });
    }

    // Incrémenter le compteur de demandes
    await service.incrementRequests();

    res.json({
      success: true,
      message: 'Demande envoyée avec succès',
      serviceOwner: {
        id: service.userId._id,
        name: `${service.userId.firstName} ${service.userId.lastName}`
      }
    });

  } catch (error) {
    console.error('Erreur lors de la demande de service:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir les statistiques des catégories
router.get('/stats/categories', async (req, res) => {
  try {
    const stats = await Service.getCategoryStats();

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
