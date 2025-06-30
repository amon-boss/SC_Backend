const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Service = require('../models/Service');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation pour envoyer un message
const messageValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Le contenu du message est obligatoire')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Le message doit contenir entre 1 et 1000 caractères'),
  
  body('messageType')
    .optional()
    .isIn(['text', 'image', 'file', 'system'])
    .withMessage('Type de message invalide')
];

// Route pour obtenir toutes les conversations de l'utilisateur
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.getForUser(req.user._id);

    const formattedConversations = conversations.map(conv => {
      // Trouver l'autre participant
      const otherParticipant = conv.participants.find(
        p => p.userId._id.toString() !== req.user._id.toString()
      );

      return {
        id: conv._id,
        otherParticipant: {
          id: otherParticipant.userId._id,
          name: otherParticipant.userName,
          firstName: otherParticipant.userId.firstName,
          lastName: otherParticipant.userId.lastName,
          avatar: otherParticipant.userId.avatar
        },
        service: conv.serviceId ? {
          id: conv.serviceId._id,
          title: conv.serviceId.title,
          category: conv.serviceId.category
        } : null,
        lastMessage: {
          content: conv.lastMessage.content,
          timestamp: conv.lastMessage.timestamp,
          isFromCurrentUser: conv.lastMessage.senderId ? 
            conv.lastMessage.senderId.toString() === req.user._id.toString() : false
        },
        unreadCount: conv.unreadCount.get(req.user._id.toString()) || 0,
        updatedAt: conv.updatedAt
      };
    });

    res.json({
      success: true,
      conversations: formattedConversations
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des conversations:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir une conversation spécifique
router.get('/conversations/:conversationId', authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants.userId', 'firstName lastName avatar')
      .populate('serviceId', 'title category');

    if (!conversation || !conversation.isActive) {
      return res.status(404).json({
        error: true,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur est participant
    if (!conversation.hasParticipant(req.user._id)) {
      return res.status(403).json({
        error: true,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    // Marquer comme lu
    await conversation.markAsRead(req.user._id);

    // Trouver l'autre participant
    const otherParticipant = conversation.participants.find(
      p => p.userId._id.toString() !== req.user._id.toString()
    );

    res.json({
      success: true,
      conversation: {
        id: conversation._id,
        otherParticipant: {
          id: otherParticipant.userId._id,
          name: otherParticipant.userName,
          firstName: otherParticipant.userId.firstName,
          lastName: otherParticipant.userId.lastName,
          avatar: otherParticipant.userId.avatar
        },
        service: conversation.serviceId ? {
          id: conversation.serviceId._id,
          title: conversation.serviceId.title,
          category: conversation.serviceId.category
        } : null,
        createdAt: conversation.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la conversation:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir les messages d'une conversation
router.get('/conversations/:conversationId/messages', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
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

    const { page = 1, limit = 50 } = req.query;
    const conversationId = req.params.conversationId;

    // Vérifier que la conversation existe et que l'utilisateur y participe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(req.user._id)) {
      return res.status(404).json({
        error: true,
        message: 'Conversation non trouvée'
      });
    }

    const skip = (page - 1) * limit;

    // Récupérer les messages
    const messages = await Message.getForConversation(conversationId, limit, skip);

    // Compter le total
    const total = await Message.countDocuments({ conversationId });

    // Marquer les messages comme lus
    await Message.markConversationAsRead(conversationId, req.user._id);

    const formattedMessages = messages.reverse().map(message => ({
      id: message._id,
      content: message.content,
      messageType: message.messageType,
      sender: {
        id: message.senderId._id,
        name: message.senderName,
        firstName: message.senderId.firstName,
        lastName: message.senderId.lastName,
        avatar: message.senderId.avatar
      },
      isFromCurrentUser: message.senderId._id.toString() === req.user._id.toString(),
      attachments: message.attachments,
      isRead: message.isRead,
      isEdited: message.isEdited,
      replyTo: message.replyTo ? {
        id: message.replyTo._id,
        content: message.replyTo.content,
        senderName: message.replyTo.senderName
      } : null,
      createdAt: message.createdAt,
      readAt: message.readAt,
      editedAt: message.editedAt
    }));

    res.json({
      success: true,
      messages: formattedMessages,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: messages.length,
        totalItems: total
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour envoyer un message
router.post('/conversations/:conversationId/messages', authenticateToken, messageValidation, async (req, res) => {
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

    const { content, messageType = 'text', attachments = [], replyTo } = req.body;
    const conversationId = req.params.conversationId;

    // Vérifier que la conversation existe et que l'utilisateur y participe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(req.user._id)) {
      return res.status(404).json({
        error: true,
        message: 'Conversation non trouvée'
      });
    }

    // Créer le message
    const message = new Message({
      conversationId,
      senderId: req.user._id,
      senderName: `${req.user.firstName} ${req.user.lastName}`,
      content,
      messageType,
      attachments,
      replyTo
    });

    await message.save();

    // Mettre à jour la conversation
    await conversation.updateLastMessage(content, req.user._id);

    // Populer les informations du sender
    await message.populate('senderId', 'firstName lastName avatar');

    res.status(201).json({
      success: true,
      message: 'Message envoyé avec succès',
      messageData: {
        id: message._id,
        content: message.content,
        messageType: message.messageType,
        sender: {
          id: message.senderId._id,
          name: message.senderName,
          firstName: message.senderId.firstName,
          lastName: message.senderId.lastName,
          avatar: message.senderId.avatar
        },
        isFromCurrentUser: true,
        attachments: message.attachments,
        createdAt: message.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour créer une nouvelle conversation
router.post('/conversations', authenticateToken, [
  body('participantId')
    .notEmpty()
    .withMessage('L\'ID du participant est obligatoire')
    .isMongoId()
    .withMessage('ID de participant invalide'),
  
  body('serviceId')
    .optional()
    .isMongoId()
    .withMessage('ID de service invalide'),
  
  body('initialMessage')
    .trim()
    .notEmpty()
    .withMessage('Le message initial est obligatoire')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Le message doit contenir entre 1 et 1000 caractères')
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

    const { participantId, serviceId, initialMessage } = req.body;

    // Vérifier que l'utilisateur ne crée pas une conversation avec lui-même
    if (participantId === req.user._id.toString()) {
      return res.status(400).json({
        error: true,
        message: 'Vous ne pouvez pas créer une conversation avec vous-même'
      });
    }

    // Vérifier que l'autre participant existe
    const otherUser = await User.findById(participantId);
    if (!otherUser || !otherUser.isActive) {
      return res.status(404).json({
        error: true,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si une conversation existe déjà
    let conversation = await Conversation.findBetweenUsers(req.user._id, participantId);

    if (!conversation) {
      // Récupérer les informations du service si fourni
      let service = null;
      if (serviceId) {
        service = await Service.findById(serviceId);
        if (!service || !service.isActive) {
          return res.status(404).json({
            error: true,
            message: 'Service non trouvé'
          });
        }
      }

      // Créer une nouvelle conversation
      conversation = await Conversation.createConversation(
        req.user,
        otherUser,
        serviceId || null,
        service ? service.title : null
      );
    }

    // Créer le message initial
    const message = new Message({
      conversationId: conversation._id,
      senderId: req.user._id,
      senderName: `${req.user.firstName} ${req.user.lastName}`,
      content: initialMessage,
      messageType: 'text'
    });

    await message.save();

    // Mettre à jour la conversation
    await conversation.updateLastMessage(initialMessage, req.user._id);

    res.status(201).json({
      success: true,
      message: 'Conversation créée avec succès',
      conversation: {
        id: conversation._id,
        otherParticipant: {
          id: otherUser._id,
          name: `${otherUser.firstName} ${otherUser.lastName}`,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          avatar: otherUser.avatar
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la création de la conversation:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour marquer une conversation comme lue
router.put('/conversations/:conversationId/read', authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    
    if (!conversation || !conversation.hasParticipant(req.user._id)) {
      return res.status(404).json({
        error: true,
        message: 'Conversation non trouvée'
      });
    }

    await conversation.markAsRead(req.user._id);
    await Message.markConversationAsRead(req.params.conversationId, req.user._id);

    res.json({
      success: true,
      message: 'Conversation marquée comme lue'
    });

  } catch (error) {
    console.error('Erreur lors du marquage comme lu:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour obtenir le nombre de messages non lus
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await Message.getUnreadCount(req.user._id);
    const unreadCount = result.length > 0 ? result[0].totalUnread : 0;

    res.json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('Erreur lors du comptage des messages non lus:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

// Route pour rechercher dans les messages
router.get('/search', authenticateToken, [
  query('q').trim().notEmpty().withMessage('Terme de recherche requis'),
  query('conversationId').optional().isMongoId().withMessage('ID de conversation invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: 'Paramètres invalides',
        details: errors.array()
      });
    }

    const { q, conversationId } = req.query;

    let messages;
    if (conversationId) {
      // Rechercher dans une conversation spécifique
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.hasParticipant(req.user._id)) {
        return res.status(404).json({
          error: true,
          message: 'Conversation non trouvée'
        });
      }

      messages = await Message.searchInConversation(conversationId, q);
    } else {
      // Rechercher dans toutes les conversations de l'utilisateur
      const userConversations = await Conversation.find({
        'participants.userId': req.user._id,
        isActive: true
      });

      const conversationIds = userConversations.map(conv => conv._id);

      messages = await Message.find({
        conversationId: { $in: conversationIds },
        content: { $regex: q, $options: 'i' }
      })
      .populate('senderId', 'firstName lastName')
      .populate('conversationId', 'participants')
      .sort({ createdAt: -1 })
      .limit(20);
    }

    const formattedMessages = messages.map(message => ({
      id: message._id,
      content: message.content,
      sender: {
        id: message.senderId._id,
        name: `${message.senderId.firstName} ${message.senderId.lastName}`
      },
      conversationId: message.conversationId,
      createdAt: message.createdAt
    }));

    res.json({
      success: true,
      messages: formattedMessages,
      count: messages.length
    });

  } catch (error) {
    console.error('Erreur lors de la recherche de messages:', error);
    res.status(500).json({
      error: true,
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;
