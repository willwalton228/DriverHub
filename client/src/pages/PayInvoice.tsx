import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CheckCircle, XCircle, FileText, CreditCard, Building2, AlertCircle, Download, Ban, Paperclip } from "lucide-react";

interface AllowedPaymentMethods {
  creditCard: boolean;
  ach: boolean;
  check: boolean;
  wire: boolean;
  enforcePrepay: boolean;
}

interface PublicInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
  customerMemo: string | null;
  allowedPaymentMethods?: AllowedPaymentMethods;
  lineItems: {
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    dateOfService: string | null;
  }[];
}

interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num || 0);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Paid</Badge>;
    case 'partially_paid':
      return <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">Partially Paid</Badge>;
    case 'overdue':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Overdue</Badge>;
    case 'sent':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Sent</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">Cancelled</Badge>;
    case 'void':
      return <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200">Void</Badge>;
    case 'written_off':
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Written Off</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function PaymentForm({ 
  invoice, 
  token,
  onSuccess 
}: { 
  invoice: PublicInvoice; 
  token: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pay/${token}/success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'Payment failed');
        toast({
          title: "Payment Failed",
          description: error.message || "An error occurred while processing your payment.",
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast({
          title: "Payment Successful",
          description: "Your payment has been processed successfully.",
        });
        onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        toast({
          title: "Payment Processing",
          description: "Your payment is being processed. You'll receive confirmation shortly.",
        });
        onSuccess();
      }
    } catch (err) {
      setErrorMessage('An unexpected error occurred');
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const allowedMethods = invoice.allowedPaymentMethods;
  const paymentMethodOrder: string[] = [];
  if (!allowedMethods || allowedMethods.creditCard) paymentMethodOrder.push('card');
  if (!allowedMethods || allowedMethods.ach) paymentMethodOrder.push('us_bank_account');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement 
        options={{
          layout: 'tabs',
          paymentMethodOrder,
        }}
      />
      
      {errorMessage && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{errorMessage}</p>
          </div>
        </div>
      )}

      <Button 
        type="submit" 
        className="w-full" 
        size="lg"
        disabled={!stripe || isProcessing}
        data-testid="button-pay-now"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {formatCurrency(invoice.balanceDue)}
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Secure payment powered by Stripe. Your payment information is encrypted and secure.
      </p>

      {allowedMethods && (allowedMethods.check || allowedMethods.wire) && (
        <div className="border-t pt-4 mt-2 space-y-2">
          <p className="text-xs font-medium text-muted-foreground text-center">
            You may also pay offline:
          </p>
          {allowedMethods.check && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="alt-method-check">
              <p className="font-medium mb-0.5 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Pay by Check
              </p>
              <p className="leading-relaxed">
                Make payable to: <strong>Driver on Demand</strong><br />
                4491 South State Road 7, Fort Lauderdale, FL 33314<br />
                Memo: Invoice #{invoice.invoiceNumber}
              </p>
            </div>
          )}
          {allowedMethods.wire && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="alt-method-wire">
              <p className="font-medium mb-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Wire Transfer
              </p>
              <p>Email <a href="mailto:billing@driverondemand.co" className="underline">billing@driverondemand.co</a> for wire details. Reference Invoice #{invoice.invoiceNumber}.</p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function PaymentSuccess({ invoice, amountPaid }: { invoice: PublicInvoice; amountPaid: string }) {
  return (
    <div className="text-center py-8">
      <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
      <p className="text-muted-foreground mb-2">
        Thank you — your payment of <strong>{formatCurrency(amountPaid)}</strong> for Invoice #{invoice.invoiceNumber} has been received.
      </p>
      <p className="text-sm text-muted-foreground">
        Questions? Email{" "}
        <a href="mailto:billing@driverondemand.co" className="underline">
          billing@driverondemand.co
        </a>
      </p>
    </div>
  );
}

function PaymentProcessing({ invoice }: { invoice: PublicInvoice }) {
  return (
    <div className="text-center py-8">
      <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
        <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Payment Processing</h2>
      <p className="text-muted-foreground mb-6">
        Your payment for Invoice #{invoice.invoiceNumber} is being processed.
        This may take a few moments.
      </p>
      <p className="text-sm text-muted-foreground">
        Please do not submit another payment. If you have questions, contact{" "}
        <a href="mailto:billing@driverondemand.co" className="underline">
          billing@driverondemand.co
        </a>
      </p>
    </div>
  );
}

export default function PayInvoice() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  
  // Check if user was redirected here after successful payment (3DS or bank redirect)
  const isSuccessRedirect = window.location.pathname.endsWith('/success');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  // Track the amount that was actually paid so the success screen is accurate
  const [amountPaid, setAmountPaid] = useState<string>('0');
  const [verifyingPayment, setVerifyingPayment] = useState(isSuccessRedirect);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data: stripeConfig } = useQuery<{ configured: boolean; publishableKey: string | null }>({
    queryKey: ['/api/stripe/config'],
  });

  const { data: invoice, isLoading, error, refetch: refetchInvoice } = useQuery<PublicInvoice>({
    queryKey: ['/api/public/invoices', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/invoices/${token}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to load invoice');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: publicAttachments } = useQuery<{ id: string; fileName: string; fileSize: number; mimeType: string; attachmentType: string; createdAt: string }[]>({
    queryKey: ["/api/public/invoices", token, "attachments"],
    enabled: !!token && !!invoice,
  });

  // Verify payment on success redirect by polling invoice status with retry
  useEffect(() => {
    if (isSuccessRedirect && invoice && verifyingPayment) {
      let retryCount = 0;
      const maxRetries = 5;
      const originalPaidAmount = parseFloat(invoice.paidAmount || '0');
      
      const checkPaymentStatus = async () => {
        try {
          const result = await refetchInvoice();
          const updatedInvoice = result.data;
          const newPaidAmount = parseFloat(updatedInvoice?.paidAmount || '0');
          
          // Check if payment was recorded (status changed or paidAmount increased)
          if (updatedInvoice && (updatedInvoice.status === 'paid' || newPaidAmount > originalPaidAmount)) {
            setPaymentSuccess(true);
            setVerifyingPayment(false);
            return;
          }
          
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: 2s, 3s, 4.5s, 6.75s, 10s
            const delay = 2000 * Math.pow(1.5, retryCount - 1);
            setTimeout(checkPaymentStatus, delay);
          } else {
            // After max retries, show processing state - webhook may still be pending
            setPaymentProcessing(true);
            setVerifyingPayment(false);
          }
        } catch (err) {
          setVerifyingPayment(false);
        }
      };
      
      // Start checking after initial delay
      const timer = setTimeout(checkPaymentStatus, 2000);
      return () => clearTimeout(timer);
    } else if (isSuccessRedirect && !invoice && !isLoading) {
      setVerifyingPayment(false);
    }
  }, [isSuccessRedirect, invoice?.id, isLoading]);

  const createPaymentIntent = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/invoices/${token}/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create payment intent');
      }
      return res.json() as Promise<PaymentIntentResponse>;
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (stripeConfig?.configured && stripeConfig.publishableKey) {
      setStripePromise(loadStripe(stripeConfig.publishableKey));
    }
  }, [stripeConfig]);

  useEffect(() => {
    // Only create payment intent for invoices that are payable (not void/cancelled/paid)
    const isPayable = invoice && 
      !paymentSuccess && 
      parseFloat(invoice.balanceDue) > 0 && 
      stripeConfig?.configured &&
      invoice.status !== 'void' &&
      invoice.status !== 'cancelled' &&
      invoice.status !== 'paid';
    
    if (isPayable) {
      // Snapshot the balance before payment starts so the success screen shows the right number
      setAmountPaid(invoice.balanceDue);
      createPaymentIntent.mutate();
    }
  }, [invoice, paymentSuccess, stripeConfig]);

  // Mark invoice as viewed when loaded (only once per session)
  const hasMarkedViewed = useRef(false);
  useEffect(() => {
    if (invoice && token && !hasMarkedViewed.current) {
      hasMarkedViewed.current = true;
      // Call mark-viewed endpoint
      fetch(`/api/public/invoices/${token}/mark-viewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => console.error('Failed to mark invoice as viewed:', err));
    }
  }, [invoice, token]);

  const BrandedHeader = () => (
    <div className="bg-[#1F2A6D] text-white py-4 px-6 shadow-md">
      <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xl font-bold tracking-tight">Driver on Demand</div>
          <div className="text-xs opacity-60 mt-0.5">AutoNition, LLC &nbsp;&middot;&nbsp; EIN 39-4553456</div>
        </div>
        <div className="text-right text-xs opacity-70">
          <div>4491 South State Road 7</div>
          <div>Fort Lauderdale, FL 33314</div>
          <div>
            <a href="mailto:billing@driverondemand.co" className="underline opacity-80 hover:opacity-100">
              billing@driverondemand.co
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  if (isLoading || verifyingPayment) {
    return (
      <div className="min-h-screen bg-[#F5F6F8]">
        <BrandedHeader />
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-[#1F2A6D]" />
            <p className="text-muted-foreground">
              {verifyingPayment ? 'Verifying payment...' : 'Loading invoice...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F6F8]">
        <BrandedHeader />
        <div className="flex items-center justify-center p-8">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">Invoice Not Found</h2>
                <p className="text-muted-foreground mb-4">
                  This invoice link is invalid or has expired.
                </p>
                <p className="text-sm text-muted-foreground">
                  Contact{" "}
                  <a href="mailto:billing@driverondemand.co" className="underline font-medium">
                    billing@driverondemand.co
                  </a>{" "}
                  for a new link.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const isPaid = invoice.status === 'paid' || parseFloat(invoice.balanceDue) <= 0;
  const isCancelled = invoice.status === 'cancelled';
  const isVoid = invoice.status === 'void';
  const isWrittenOff = invoice.status === 'written_off';
  
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/public/invoices/${token}/pdf`);
      if (response.status === 410) {
        alert('This payment link has expired. Please contact the sender for a new link.');
        return;
      }
      if (!response.ok) {
        alert('Failed to download invoice. Please try again later.');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to download invoice. Please try again later.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <BrandedHeader />

      <div className="py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle data-testid="text-invoice-number">Invoice #{invoice.invoiceNumber}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(invoice.status)}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    data-testid="button-download-pdf"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    {downloadingPdf ? 'Downloading...' : 'Download'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Billed To</p>
                  <p className="font-medium" data-testid="text-customer-name">{invoice.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(invoice.dueDate)}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Line Items</h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 text-sm text-muted-foreground font-medium">
                    <div className="col-span-6">Description</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-2 text-right">Amount</div>
                  </div>
                  {invoice.lineItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 text-sm py-2 border-b last:border-b-0">
                      <div className="col-span-6">
                        {item.description}
                        {item.dateOfService && (
                          <span className="text-muted-foreground ml-1">
                            ({formatDate(item.dateOfService)})
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right">{parseFloat(item.quantity).toFixed(2)}</div>
                      <div className="col-span-2 text-right">{formatCurrency(item.unitPrice)}</div>
                      <div className="col-span-2 text-right font-medium">{formatCurrency(item.totalPrice)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotalAmount)}</span>
                </div>
                {parseFloat(invoice.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Tax</span>
                    <span>{formatCurrency(invoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.totalAmount)}</span>
                </div>
                {parseFloat(invoice.paidAmount) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Paid</span>
                    <span>- {formatCurrency(invoice.paidAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Balance Due</span>
                  <span data-testid="text-balance-due">{formatCurrency(invoice.balanceDue)}</span>
                </div>
              </div>

              {invoice.customerMemo && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground">{invoice.customerMemo}</p>
                  </div>
                </>
              )}

              {publicAttachments && publicAttachments.length > 0 && (
                <>
                  <Separator />
                  <div data-testid="public-attachments-section">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Supporting Documents
                    </h3>
                    <div className="space-y-2">
                      {publicAttachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                          data-testid={`public-attachment-${att.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{att.fileName}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {att.attachmentType.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/public/invoices/${token}/attachments/${att.id}/download`);
                                if (!res.ok) throw new Error('Download failed');
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = att.fileName;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              } catch {
                                alert('Failed to download file.');
                              }
                            }}
                            data-testid={`button-download-public-attachment-${att.id}`}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentSuccess ? (
                <PaymentSuccess invoice={invoice} amountPaid={amountPaid} />
              ) : paymentProcessing ? (
                <PaymentProcessing invoice={invoice} />
              ) : isPaid ? (
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Invoice Paid</h3>
                  <p className="text-sm text-muted-foreground">
                    This invoice has been fully paid. Thank you!
                  </p>
                </div>
              ) : isVoid ? (
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center mb-4">
                    <Ban className="h-8 w-8 text-slate-600 dark:text-slate-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Invoice Voided</h3>
                  <p className="text-sm text-muted-foreground">
                    This invoice has been voided and is no longer valid.
                  </p>
                </div>
              ) : isCancelled ? (
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center mb-4">
                    <XCircle className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Invoice Cancelled</h3>
                  <p className="text-sm text-muted-foreground">
                    This invoice has been cancelled and is no longer payable.
                  </p>
                </div>
              ) : isWrittenOff ? (
                <div className="text-center py-6" data-testid="invoice-written-off-notice">
                  <div className="mx-auto w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Invoice Written Off</h3>
                  <p className="text-sm text-muted-foreground">
                    This invoice has been written off and is no longer accepting payments.
                  </p>
                </div>
              ) : invoice.allowedPaymentMethods && !invoice.allowedPaymentMethods.creditCard && !invoice.allowedPaymentMethods.ach ? (
                <div className="py-4 space-y-4" data-testid="offline-payment-only">
                  <div className="text-center">
                    <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <h3 className="font-semibold">Offline Payment Required</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Online payments are not available for this account.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {invoice.allowedPaymentMethods.check && (
                      <div className="rounded-md border p-3" data-testid="method-check-info">
                        <div className="flex items-center gap-2 font-medium text-sm mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Pay by Check
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Make check payable to: <strong>Driver on Demand</strong><br />
                          4491 South State Road 7<br />
                          Fort Lauderdale, FL 33314<br />
                          Please write Invoice #{invoice.invoiceNumber} on the memo line.
                        </p>
                      </div>
                    )}
                    {invoice.allowedPaymentMethods.wire && (
                      <div className="rounded-md border p-3" data-testid="method-wire-info">
                        <div className="flex items-center gap-2 font-medium text-sm mb-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          Wire Transfer
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Contact us for wire instructions. Include Invoice #{invoice.invoiceNumber} in your reference.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="text-center pt-1">
                    <p className="text-xs text-muted-foreground">
                      Questions?{" "}
                      <a href="mailto:billing@driverondemand.co" className="underline font-medium">
                        billing@driverondemand.co
                      </a>
                    </p>
                  </div>
                </div>
              ) : !stripeConfig?.configured ? (
                <div className="text-center py-6">
                  <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Online Payments Unavailable</h3>
                  <p className="text-sm text-muted-foreground">
                    Online payments are currently not configured. Please contact us for payment options.
                  </p>
                </div>
              ) : !clientSecret ? (
                <div className="text-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">Preparing payment form...</p>
                </div>
              ) : stripePromise ? (
                <Elements 
                  stripe={stripePromise} 
                  options={{ 
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#1F2A6D',
                      },
                    },
                  }}
                >
                  <PaymentForm 
                    invoice={invoice} 
                    token={token || ''} 
                    onSuccess={() => setPaymentSuccess(true)} 
                  />
                </Elements>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <BillingDocumentsSection />

        <p className="text-center text-xs text-muted-foreground mt-8">
          Driver on Demand &nbsp;&middot;&nbsp; Secure payments by Stripe &nbsp;&middot;&nbsp; <a href="mailto:billing@driverondemand.co" className="underline">billing@driverondemand.co</a>
        </p>
      </div>
      </div>
    </div>
  );
}

// ─── Public Billing Documents Section ────────────────────────────────────────
interface PublicBillingDoc {
  id: string;
  documentType: string;
  displayName: string;
  fileName: string;
  effectiveDate: string | null;
  fileSizeBytes: number | null;
}

function formatDocDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function BillingDocumentsSection() {
  const { data: docs = [], isLoading } = useQuery<PublicBillingDoc[]>({
    queryKey: ["/api/public/billing-documents/active"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || docs.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-xs text-center text-muted-foreground mb-3 uppercase tracking-wider font-medium">Billing Documents</p>
      <div className="flex flex-wrap justify-center gap-3">
        {docs.map(doc => (
          <a
            key={doc.id}
            href={`/api/public/billing-documents/${doc.documentType}/download`}
            download={doc.fileName}
            className="flex items-center gap-2 px-4 py-2 rounded-md border text-sm text-muted-foreground hover:text-foreground transition-colors bg-card"
            data-testid={`link-download-billing-doc-${doc.id}`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>
              {doc.displayName}
              {doc.effectiveDate && (
                <span className="ml-1 text-xs opacity-70">({formatDocDate(doc.effectiveDate)})</span>
              )}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
