const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: {
      type: String,
      required: true
    }
  }],
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  serviceTitle: {
    type: String,
    default: null
  },
  lastMessage: {
    content: {
      type: String,
      default: ''
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  }
}, {
  timestamps: true
});

// Index pour optimiser les recherches
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ serviceId: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ isActive: 1 });

// Méthode pour ajouter un participant
conversationSchema.methods.addParticipant = function(userId, userName) {
  const exists = this.participants.some(p => p.userId.toString() === userId.toString());
  if (!exists) {
    this.participants.push({ userId, userName });
  }
  return this;
};

// Méthode pour supprimer un participant
conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.userId.toString() !== userId.toString());
  return this;
};

// Méthode pour vérifier si un utilisateur est participant
conversationSchema.methods.hasParticipant = function(userId) {
  return this.participants.some(p => p.userId.toString() === userId.toString());
};

// Méthode pour mettre à jour le dernier message
conversationSchema.methods.updateLastMessage = function(content, senderId) {
  this.lastMessage = {
    content: content.substring(0, 100), // Limiter à 100 caractères
    senderId,
    timestamp: new Date()
  };
  
  // Mettre à jour les compteurs non lus
  this.participants.forEach(participant => {
    if (participant.userId.toString() !== senderId.toString()) {
      const currentCount = this.unreadCount.get(participant.userId.toString()) || 0;
      this.unreadCount.set(participant.userId.toString(), currentCount + 1);
    }
  });
  
  return this.save();
};

// Méthode pour marquer comme lu
conversationSchema.methods.markAsRead = function(userId) {
  this.unreadCount.set(userId.toString(), 0);
  return this.save();
};

// Méthode statique pour trouver une conversation entre deux utilisateurs
conversationSchema.statics.findBetweenUsers = function(userId1, userId2) {
  return this.findOne({
    $and: [
      { 'participants.userId': userId1 },
      { 'participants.userId': userId2 }
    ],
    isActive: true
  }).populate('participants.userId', 'firstName lastName avatar');
};

// Méthode statique pour obtenir les conversations d'un utilisateur
conversationSchema.statics.getForUser = function(userId) {
  return this.find({
    'participants.userId': userId,
    isActive: true
  })
  .populate('participants.userId', 'firstName lastName avatar')
  .populate('serviceId', 'title category')
  .sort({ updatedAt: -1 });
};

// Méthode statique pour créer une nouvelle conversation
conversationSchema.statics.createConversation = function(user1, user2, serviceId = null, serviceTitle = null) {
  return this.create({
    participants: [
      { userId: user1.id, userName: `${user1.firstName} ${user1.lastName}` },
      { userId: user2.id, userName: `${user2.firstName} ${user2.lastName}` }
    ],
    serviceId,
    serviceTitle,
    unreadCount: {
      [user1.id]: 0,
      [user2.id]: 0
    }
  });
};

module.exports = mongoose.model('Conversation', conversationSchema);
