import mongoose from "mongoose";

const artistBalanceSchema = new mongoose.Schema(
  {
    artistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artist",
      unique: true,
      required: true,
    },

    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },

    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPaidOut: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const ArtistBalance = mongoose.model(
  "ArtistBalance",
  artistBalanceSchema
);
