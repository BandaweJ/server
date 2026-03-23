import 'reflect-metadata';
import { FinanceController } from './finance.controller';
import { HAS_PERMISSIONS_KEY } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';

describe('FinanceController authorization metadata', () => {
  const permissionFor = (methodName: keyof FinanceController): string[] =>
    Reflect.getMetadata(
      HAS_PERMISSIONS_KEY,
      FinanceController.prototype[methodName],
    ) as string[];

  it('protects fees endpoints with expected permissions', () => {
    expect(permissionFor('getAllFees')).toEqual([PERMISSIONS.FINANCE.VIEW]);
    expect(permissionFor('createFees')).toEqual([
      PERMISSIONS.FINANCE.MANAGE_FEES,
    ]);
    expect(permissionFor('updateFees')).toEqual([PERMISSIONS.FINANCE.EDIT]);
    expect(permissionFor('deleteFees')).toEqual([PERMISSIONS.FINANCE.DELETE]);
  });

  it('protects billing endpoints with expected permissions', () => {
    expect(permissionFor('createBills')).toEqual([PERMISSIONS.FINANCE.CREATE]);
    expect(permissionFor('getAllBills')).toEqual([PERMISSIONS.FINANCE.VIEW]);
    expect(permissionFor('removeBill')).toEqual([PERMISSIONS.FINANCE.DELETE]);
    expect(permissionFor('getTotalBillByTerm')).toEqual([
      PERMISSIONS.FINANCE.VIEW,
    ]);
  });
});
