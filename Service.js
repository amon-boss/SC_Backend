const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre du service est obligatoire'],
    trim: true,
    maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères']
  },
  content: {
    type: String,
    required: [true, 'La description du service est obligatoire'],
    trim: true,
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
  },
  category: {
    type: String,
    required: [true, 'La catégorie est obligatoire'],
    enum: {
      values: [
        'Bricolage',
        'Ménage', 
        'Jardinage',
        'Informatique',
        'Déménagement',
        'Électricité',
        'Plomberie',
        'Peinture',
        'Cuisine',
        'Mécanique',
        'Autres'
      ],
      message: 'Catégorie invalide'
    }
  },
  price: {
    type: Number,
    min: [0, 'Le prix ne peut pas être négatif'],
    default: null
  },
  priceType: {
    type: String,
    enum: ['heure', 'jour', 'fixe', 'negociable'],
    default: 'negociable'
  },
  location: {
    type: String,
    trim: true,
    maxlength: [200, 'La localisation ne peut pas dépasser 200 caractères']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'ID utilisateur est obligatoire']
  },
  userName: {
    type: String,
    required: [true, 'Le nom de l\'utilisateur est obligatoire']
  },
  userType: {
    type: String,
    required: [true, 'Le type d\'utilisateur est obligatoire'],
    enum: ['particulier', 'prestataire']
  },
  images: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  requests: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  availableFrom: {
    type: Date,
    default: Date.now
  },
  availableTo: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index pour optimiser les recherches
serviceSchema.index({ userId: 1 });
serviceSchema.index({ category: 1 });
serviceSchema.index({ isActive: 1 });
serviceSchema.index({ createdAt: -1 });
serviceSchema.index({ 
  title: 'text', 
  content: 'text', 
  tags: 'text' 
});
serviceSchema.index({ location: 1 });
serviceSchema.index({ price: 1 });

// Middleware pour valider que seuls les prestataires peuvent poster des services
serviceSchema.pre('save', function(next) {
  if (this.isNew && this.userType !== 'prestataire') {
    const error = new Error('Seuls les prestataires peuvent poster des services');
    error.status = 403;
    return next(error);
  }
  next();
});

// Méthode pour incrémenter les vues
serviceSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Méthode pour incrémenter les demandes
serviceSchema.methods.incrementRequests = function() {
  this.requests += 1;
  return this.save();
};

// Méthode statique pour rechercher des services
serviceSchema.statics.search = function(query, category = null, limit = 20, skip = 0) {
  const searchCriteria = { isActive: true };
  
  if (query) {
    searchCriteria.$text = { $search: query };
  }
  
  if (category && category !== 'Tous') {
    searchCriteria.category = category;
  }
  
  return this.find(searchCriteria)
    .populate('userId', 'firstName lastName rating ratingCount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Méthode statique pour obtenir les services par utilisateur
serviceSchema.statics.getByUser = function(userId) {
  return this.find({ userId, isActive: true })
    .sort({ createdAt: -1 })
    .populate('userId', 'firstName lastName rating ratingCount');
};

// Méthode statique pour obtenir les statistiques par catégorie
serviceSchema.statics.getCategoryStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    { 
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        avgRating: { $avg: '$rating' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = mongoose.model('Service', serviceSchema);
