import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Schema = mongoose.Schema;

export interface InvoicesDoc {
  invoiceId: string;
  amount: number;
  currency: string;
  date: Date;
  status: string;
  description: string;
  plan: string;
  invoiceNumber: number;
  type: "exhausted" | "plan";
}

export interface TransactionsDoc {
  amount: number;
  type: "credit" | "debit";
  usageType: "command-gen" | "exploit-box";
  date: Date;
  description: string;
}

export interface PaymentMethodDoc {
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  paymentMethodId?: string;
}

export interface BugbaseDoc {
  username: string;
  connected: boolean;
  lastSynced: Date[];
}

export interface UserDoc extends mongoose.Document {
  email: string;
  name: string;
  password: string;
  profilePicture: string;
  openvpnFile: string;
  billing: {
    customerId: string;
    plan: "FREE" | "LEET" | "CUSTOM";
    recurringInterval: "month" | "year";
    subscriptionId: string;

    status: string;
    nextBillingDate: Date;
    sessionId?: string;
    paymentMethod?: PaymentMethodDoc | null;
    payAsYouGo: boolean;
    payAsYouGoInvoiceId?: string | null;
  };
  invoices: InvoicesDoc[];
  credits: {
    remainingCredits: number;
    totalCredits: number;
    usedCredits: number;
    lastUpdated: Date;
  };
  exploitBox: {
    remainingHours: number;
    totalHours: number;
    usedHours: number;
    lastUpdated: Date;
  };
  transactions: TransactionsDoc[];

  // billing: {
  //   customerId: string;
  //   subscriptionId?: string;
  //   sessionId?: string;
  //   plan?: string;
  //   status?: string;
  //   nextBillingDate?: Date;
  //   paymentMethod?: PaymentMethodDoc;
  // };
  firstLogin?: boolean;
  // transactions: TransactionsDoc[];
  // goldTransactions: GoldTransactionsDoc[];
  // gold: number;
  bugbase: BugbaseDoc;
  kycId: mongoose.Types.ObjectId;
  ipLocation: {
    ip: string;
    range: [number, number];
    country: string;
    region: string;
    eu: string;
    timezone: string;
    city: string;
    ll: [number, number];
    metro: number;
    area: number;
  };
  ip: string;
  configs: {
    tools: string[];
    volumeId: string;
    volumeCreatedAt: Date;
  };
  referredBy: mongoose.Types.ObjectId;
  workingIndustry: string;
  workingExperience: string;
  referralSource: string;
}

const UserSchema = new Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/,
  },
  name: { type: String, required: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  openvpnFile: { type: String },
  firstLogin: { type: Boolean, default: true },
  billing: {
    customerId: { type: String },
    plan: { type: String, enum: ["FREE", "LEET", "CUSTOM"] },
    recurringInterval: { type: String, enum: ["month", "year"] },
    subscriptionId: { type: String },
    status: { type: String },
    nextBillingDate: { type: Date },
    sessionId: { type: String },
    paymentMethod: {
      last4: { type: String },
      brand: { type: String },
      expMonth: { type: Number },
      expYear: { type: Number },
      paymentMethodId: { type: String },
    },
    payAsYouGo: { type: Boolean, default: false },
    payAsYouGoInvoiceId: { type: String },
  },
  invoices: [
    {
      invoiceId: { type: String },
      amount: { type: Number },
      currency: { type: String },
      date: { type: Date },
      status: { type: String },
      type: { type: String, enum: ["exhausted", "plan"], default: "plan" },
      description: { type: String },
      plan: { type: String },
      invoiceNumber: { type: String },
    },
  ],
  credits: {
    remainingCredits: { type: Number, default: 99999999 },
    totalCredits: { type: Number },
    usedCredits: { type: Number },
    lastUpdated: { type: Date },
  },
  exploitBox: {
    remainingHours: { type: Number, default: 99999999 },
    totalHours: { type: Number },
    usedHours: { type: Number },
    lastUpdated: { type: Date },
  },
  transactions: [
    {
      amount: { type: Number },
      type: { type: String, enum: ["credit", "debit"] },
      usageType: { type: String, enum: ["command-gen", "exploit-box"] },
      date: { type: Date },
      description: { type: String },
      transactionId: { type: String },
    },
  ],
  // gold: { type: Number, default: 0 },
  // goldTransactions: [
  //   {
  //     goldTransacted: {
  //       type: Number,
  //       required: true,
  //     },
  //     type: {
  //       type: String,
  //       enum: ["credit", "debit"],
  //       required: true,
  //     },
  //     description: String,
  //     date: {
  //       type: Date,
  //       required: true,
  //     },
  //   },
  // ],
  // billing: {
  //   customerId: { type: String },
  //   subscriptionId: { type: String },
  //   sessionId: { type: String },
  //   plan: { type: String, enum: ["FREE", "PRO", "FLEXIBLE"] },
  //   status: { type: String },
  //   nextBillingDate: { type: Date },
  //   paymentMethod: {
  //     last4: { type: String },
  //     brand: { type: String },
  //     expMonth: { type: Number },
  //     expYear: { type: Number },
  //   },
  // },
  kycId: { type: mongoose.Schema.Types.ObjectId, ref: "KYC" },
  // transactions: [
  //   {
  //     amount: {
  //       type: Number,
  //       required: true,
  //     },
  //     date: {
  //       type: Date,
  //       required: true,
  //     },
  //     description: String,
  //     currency: {
  //       type: String,
  //       required: true,
  //     },
  //     status: {
  //       type: String,
  //       required: true,
  //     },
  //     transactionId: {
  //       type: String,
  //       required: true,
  //     },
  //   },
  // ],
  bugbase: {
    username: { type: String },
    connected: { type: Boolean, default: false },
    lastSynced: [{ type: Date }],
  },
  ipLocation: {
    ip: { type: String },
    range: [Number, Number],
    country: { type: String },
    region: { type: String },
    eu: { type: String },
    timezone: { type: String },
    city: { type: String },
    ll: [Number, Number],
    metro: Number,
    area: Number,
  },
  ip: { type: String },
  configs: {
    tools: {
      type: [
        {
          type: String,
        },
      ],
      default: ["nmap", "feroxbuster", "subfinder", "hydra", "sqlmap"],
    },
    volumeId: { type: String },
    volumeCreatedAt: { type: Date },
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId },
  workingIndustry: { type: String },
  workingExperience: { type: String },
  referralSource: { type: String },
});

export default mongoose.model<UserDoc>("User", UserSchema);
