/**
 * Payment Provider Factory — returns the correct provider based on user country.
 * GB → Stripe Connect
 * NG → Flutterwave
 */
import { StripeProvider } from './StripeProvider.js';
import { FlutterwaveProvider } from './FlutterwaveProvider.js';
import type { IPaymentProvider } from './PaymentProviderInterface.js';

const stripeProvider     = new StripeProvider();
const flutterwaveProvider = new FlutterwaveProvider();

export function getPaymentProvider(country: string): IPaymentProvider {
  if (country === 'NG') return flutterwaveProvider;
  return stripeProvider; // default to Stripe for GB and all other countries
}

export function getStripeProvider(): StripeProvider {
  return stripeProvider;
}

export function getFlutterwaveProvider(): FlutterwaveProvider {
  return flutterwaveProvider;
}
