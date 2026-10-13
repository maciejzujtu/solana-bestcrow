import type { EndpointDefinition } from '../../core/endpoint.js';
import type {
  AccountDto,
  ConfirmPaymentInput,
  ContributionDto,
  CreatePaymentInput,
  CreatorProfileDto,
  LoginInput,
  PaymentDto,
  RegisterInput,
  SessionDto,
  SuccessDto,
  WalletChallengeDto,
  WalletChallengeInput,
  WalletDto,
  WalletProofInput,
  ContributionDto,
  CreatorProfileDto,
} from './types.js';
import type { RewardClaimDto, RewardOfferDto } from './types.js';

type Empty = Record<string, never>;
type PaymentPath = { path: { id: string } };

export interface AccountsEndpoints {
  register: EndpointDefinition<{ body: RegisterInput }, SessionDto>;
  login: EndpointDefinition<{ body: LoginInput }, SessionDto>;
  logout: EndpointDefinition<Empty, SuccessDto>;
  me: EndpointDefinition<Empty, AccountDto>;
  contributions: EndpointDefinition<Empty, ContributionDto[]>;
  profile: EndpointDefinition<Empty, CreatorProfileDto | null>;
  updateProfile: EndpointDefinition<{ body: Omit<CreatorProfileDto, 'userId' | 'updatedAt'> }, CreatorProfileDto>;
  challenge: EndpointDefinition<{ body: WalletChallengeInput }, WalletChallengeDto>;
  linkWallet: EndpointDefinition<{ body: WalletProofInput }, WalletDto>;
  walletLogin: EndpointDefinition<{ body: WalletProofInput }, SessionDto>;
  wallets: EndpointDefinition<Empty, WalletDto[]>;
  unlinkWallet: EndpointDefinition<{ path: { address: string } }, SuccessDto>;
  createPayment: EndpointDefinition<{ body: CreatePaymentInput }, PaymentDto>;
  payments: EndpointDefinition<Empty, PaymentDto[]>;
  payment: EndpointDefinition<PaymentPath, PaymentDto>;
  confirmPayment: EndpointDefinition<PaymentPath & { body: ConfirmPaymentInput }, PaymentDto>;
  rewards: EndpointDefinition<{ path: { campaign: string } }, RewardOfferDto[]>;
  claims: EndpointDefinition<Empty, RewardClaimDto[]>;
  claimReward: EndpointDefinition<{ path: { id: string }; body: { delivery?: unknown } }, RewardClaimDto>;
}

export const accountsEndpoints: AccountsEndpoints = {
  register: { path: 'api/accounts/auth/register', method: 'POST', auth: 'public' },
  login: { path: 'api/accounts/auth/login', method: 'POST', auth: 'public' },
  logout: { path: 'api/accounts/auth/logout', method: 'POST', auth: 'required' },
  me: { path: 'api/accounts/me', method: 'GET', auth: 'required' },
  contributions: { path: 'api/accounts/me/contributions', method: 'GET', auth: 'required' },
  profile: { path: 'api/accounts/me/profile', method: 'GET', auth: 'required' },
  updateProfile: { path: 'api/accounts/me/profile', method: 'PUT', auth: 'required' },
  challenge: { path: 'api/accounts/wallets/challenge', method: 'POST', auth: 'optional' },
  linkWallet: { path: 'api/accounts/wallets/link', method: 'POST', auth: 'required' },
  walletLogin: { path: 'api/accounts/auth/wallet-login', method: 'POST', auth: 'public' },
  wallets: { path: 'api/accounts/wallets', method: 'GET', auth: 'required' },
  unlinkWallet: { path: 'api/accounts/wallets/:address', method: 'DELETE', auth: 'required' },
  createPayment: { path: 'api/accounts/payments', method: 'POST', auth: 'required' },
  payments: { path: 'api/accounts/payments', method: 'GET', auth: 'required' },
  payment: { path: 'api/accounts/payments/:id', method: 'GET', auth: 'required' },
  confirmPayment: { path: 'api/accounts/payments/:id/confirm', method: 'POST', auth: 'required' },
  rewards: { path: 'api/accounts/rewards/campaigns/:campaign/rewards', method: 'GET', auth: 'public' },
  claims: { path: 'api/accounts/rewards/me/reward-claims', method: 'GET', auth: 'required' },
  claimReward: { path: 'api/accounts/rewards/:id/claim', method: 'POST', auth: 'required' },
};
