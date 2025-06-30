const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'L\'ID de conversation est obligatoire']
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'ID de l\'expéditeur est obligatoire']
  },
  senderName: {
    type: String,
    required: [true, 'Le nom de l\'expéditeur est obligatoire']
  },
  content: {
    type: String,
    required: [true, 'Le contenu du message est obligatoire'],
    trim: true,
    maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'file']
    },
    url: String,
    filename: String,
    size: Number
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  }
}, {
  timestamps: true
});

// Index pour optimiser les recherches
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ createdAt: -1 });

// Middleware pour mettre à jour la conversation lors de l'ajout d'un message
messageSchema.post('save', async function() {
  try {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(
      this.conversationId,
      {
        $set: {
          'lastMessage.content': this.content,
          'lastMessage.senderId': this.senderId,
          'lastMessage.timestamp': this.createdAt,
          updatedAt: this.createdAt
        }
      }
    );
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la conversation:', error);
  }
});

// Méthode pour marquer comme lu
messageSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Méthode pour éditer le message
messageSchema.methods.editContent = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Méthode statique pour obtenir les messages d'une conversation
messageSchema.statics.getForConversation = function(conversationId, limit = 50, skip = 0) {
  return this.find({ conversationId })
    .populate('senderId', 'firstName lastName avatar')
    .populate('replyTo', 'content senderName')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Méthode statique pour marquer tous les messages d'une conversation comme lus
messageSchema.statics.markConversationAsRead = function(conversationId, userId) {
  return this.updateMany(
    { 
      conversationId, 
      senderId: { $ne: userId },
      isRead: false 
    },
    { 
      $set: { 
        isRead: true, 
        readAt: new Date() 
      } 
    }
  );
};

// Méthode statique pour compter les messages non lus d'un utilisateur
messageSchema.statics.getUnreadCount = function(userId) {
  return this.aggregate([
    {
      $lookup: {
        from: 'conversations',
        localField: 'conversationId',
        foreignField: '_id',
        as: 'conversation'
      }
    },
    {
      $match: {
        'conversation.participants.userId': userId,
        senderId: { $ne: userId },
        isRead: false
      }
    },
    {
      $group: {
        _id: '$conversationId',
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: null,
        totalUnread: { $sum: '$count' }
      }
    }
  ]);
};

// Méthode statique pour rechercher dans les messages
messageSchema.statics.searchInConversation = function(conversationId, query) {
  return this.find({
    conversationId,
    content: { $regex: query, $options: 'i' }
  })
  .populate('senderId', 'firstName lastName')
  .sort({ createdAt: -1 })
  .limit(10);
};

module.exports = mongoose.model('Message', messageSchema);
