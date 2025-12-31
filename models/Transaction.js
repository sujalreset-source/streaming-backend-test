import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  itemType: { type: String, enum: ["song", "album", "artist-subscription"], required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  artistId: { type: mongoose.Schema.Types.ObjectId, ref: "Artist" },
  gateway: { type: String, enum: ["stripe", "razorpay", "paypal"], required: true },
  amount: { type: Number, required: true},
  amountUSD: { type: Number},
  /**
     * Exchange rate used to convert original currency → USD
     * Example: INR → USD = 0.011
     */
    exchangeRate: {
      type: Number,
      required: false,
      min: 0,
    },

    /**
     * Source of exchange rate
     * e.g. "static", "openexchangerates", "stripe", "paypal"
     */
    exchangeRateSource: {
      type: String,
      enum: ["static", "provider", "manual"],
      default: "static",
    },

    /**
     * Timestamp when exchange rate was applied
     * MUST be set when transaction becomes PAID
     */
    exchangeRateAt: {
      type: Date,
    },
  currency: { type: String, required: true },
  platformFee: { type: Number, required: true },
  artistShare: { type: Number, required: true },
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  paymentIntentId: String,         // Stripe
  razorpayOrderId: String,         // Razorpay
  stripeSubscriptionId: String,    // For Stripe recurring subs
  paypalOrderId: String,
  invoiceNumber: String,      // ✅ Store generated invoice number
  metadata: { type: Object, default: {} }, // ✅ Flexible key-value storage
}, { timestamps: true }); // ✅ adds createdAt & updatedAt
export const Transaction =  mongoose.model("Transaction", transactionSchema);
