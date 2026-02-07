const mongoose = require("mongoose");
const { generateShortCode } = require("../helpers");

const urlSchema = new mongoose.Schema(
  {
    shortCode: {
      type: String,
      required: true,
      unique: true,
      default: () => generateShortCode(),
      index: true,
    },
    longUrl: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: (props) => `${props.value} is not a valid URL!`,
      },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    customCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for short URL
urlSchema.virtual("shortUrl").get(function () {
  return `${process.env.BASE_URL}/${this.shortCode}`;
});

// Indexes
urlSchema.index({ createdAt: -1 });
urlSchema.index({ userId: 1 });
urlSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Middleware to increment click count
urlSchema.methods.incrementClick = async function () {
  this.clicks += 1;
  await this.save();
  return this.clicks;
};

// Check if URL is expired
urlSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

const Url = mongoose.model("Url", urlSchema);
module.exports = Url;
