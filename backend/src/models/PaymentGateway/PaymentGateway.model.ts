import mongoose from "mongoose";
const Schema = mongoose.Schema;

/**
 * Supported payment channels.
 *  - googlepay : Google Pay (merchant id / gateway config)
 *  - alipay    : Alipay (merchant id / app id)
 *  - linepay   : LINE Pay (channel id / secret)
 *  - crypto    : Crypto wallets (ETH / BTC / BNB addresses)
 */
export type PaymentChannel =
  | "googlepay"
  | "alipay"
  | "linepay"
  | "paypal"
  | "crypto_eth"
  | "crypto_btc"
  | "crypto_bnb";


export interface CryptoWalletConfig {
  /** Wallet address for receiving funds. */
  address: string;
  /** Network name (e.g. "Ethereum", "Bitcoin", "BNB Smart Chain"). */
  network: string;
  /** Optional memo / tag for exchanges that require it. */
  memo?: string;
}

export interface PaymentGatewayDoc extends mongoose.Document {
  channel: PaymentChannel;
  label: string;
  enabled: boolean;
  /** Human-readable instructions shown to the buyer. */
  instructions?: string;
  /** Generic merchant / app id (Google Pay, Alipay, LINE Pay). */
  merchantId?: string;
  /** Secret / key for the channel (LINE Pay channel secret, etc.). */
  secret?: string;
  /** Crypto wallet details (only for crypto_* channels). */
  cryptoWallet?: CryptoWalletConfig;
  /** Brand logo URL / favicon shown in admin & checkout UI. */
  logo?: string;
  /** Fallback accent color (hex) used when no logo image is set. */
  logoColor?: string;
  /** Display order in the checkout UI. */
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentGatewaySchema = new Schema(
  {
    channel: {
      type: String,
      enum: ["googlepay", "alipay", "linepay", "paypal", "crypto_eth", "crypto_btc", "crypto_bnb"],

      required: true,
      unique: true,
    },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: false },
    instructions: { type: String },
    merchantId: { type: String },
    secret: { type: String },
    cryptoWallet: {
      address: { type: String },
      network: { type: String },
      memo: { type: String },
    },
    logo: { type: String },
    logoColor: { type: String },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<PaymentGatewayDoc>("PaymentGateway", PaymentGatewaySchema);
