import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;
  const paymentService = {
    getFinanceDashboardSummary: jest.fn(),
    bulkInvoiceClassTerm: jest.fn(),
  };

  beforeEach(() => {
    controller = new PaymentController(paymentService as unknown as PaymentService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes termType filter to dashboard summary', () => {
    paymentService.getFinanceDashboardSummary.mockReturnValue({ ok: true });

    controller.getFinanceDashboardSummary(
      '2026-04-01',
      '2026-04-30',
      '2 2026',
      'vacation',
      'Invoice',
    );

    expect(paymentService.getFinanceDashboardSummary).toHaveBeenCalledWith({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      enrolTerm: '2 2026',
      termType: 'vacation',
      transactionType: 'Invoice',
    });
  });

  it('passes payload to bulk class invoicing service', () => {
    const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;
    const profile = { email: 'finance@example.com' } as any;
    const body = { dryRun: true, termId: 2 };

    controller.bulkInvoiceClass('Form 1A', 1, 2026, body, profile, req);

    expect(paymentService.bulkInvoiceClassTerm).toHaveBeenCalledWith(
      'Form 1A',
      1,
      2026,
      body,
      'finance@example.com',
      '127.0.0.1',
    );
  });
});
