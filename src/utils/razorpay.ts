declare global {
  interface Window {
    Razorpay: any;
  }
}

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  callback_url?: string;
  redirect?: boolean;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export const openRazorpayCheckout = async (options: RazorpayOptions): Promise<void> => {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    throw new Error('Failed to load Razorpay checkout. Check your internet connection.');
  }

  if (!window.Razorpay) {
    throw new Error('Razorpay SDK not available. Please try again or use a different browser.');
  }

  const rzp = new window.Razorpay(options);

  // Handle WebView payment failures gracefully
  rzp.on('payment.failed', (response: any) => {
    console.error('Razorpay payment failed:', response?.error);
  });

  rzp.open();
};
