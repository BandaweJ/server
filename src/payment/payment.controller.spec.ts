import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;
  const paymentService = {
    getFinanceDashboardSummary: jest.fn(),
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
});
