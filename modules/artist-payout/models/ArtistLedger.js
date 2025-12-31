import mongoose from "mongoose";

const artistLedgerSchema = new mongoose.Schema(
  {
    artistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artist",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    source: {
      type: String,
      enum: ["song", "album", "subscription", "payout"],
      required: true,
    },

    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    amountUSD: {
      type: Number,
      min: 0,
    },

    grossAmount: {
      type: Number,
      min: 0,
    },
    grossAmountUSD: {
      type: Number,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

/**
 * Idempotency guard
 * - One transaction → one credit
 * - One payout → one debit
 */
artistLedgerSchema.index(
  { type: 1, refId: 1 },
  { unique: true }
);

export const ArtistLedger = mongoose.model(
  "ArtistLedger",
  artistLedgerSchema
);
