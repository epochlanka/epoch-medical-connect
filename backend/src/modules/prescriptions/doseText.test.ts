import { doseAmount, howToTakeParts } from './doseText';

describe('dose wording on printed prescriptions and labels', () => {
  it('says how much is taken each time, in the medicine’s own unit', () => {
    expect(doseAmount(2, 'Tablet')).toBe('2 tablets');
    expect(doseAmount(1, 'Capsule')).toBe('1 capsule');
    expect(doseAmount(0.5, 'Tablet')).toBe('0.5 tablet');
    expect(doseAmount(5, 'ml')).toBe('5 ml');
    expect(doseAmount(2.5, 'Gram')).toBe('2.5 g');
  });

  it('gives nothing when the dose per time was not recorded', () => {
    expect(doseAmount(null, 'Tablet')).toBeNull();
    expect(doseAmount(0, 'Tablet')).toBeNull();
  });

  it('puts the dose first, then the doctor’s schedule', () => {
    const parts = howToTakeParts({ dose_qty: 2, dosage: '500 mg', frequency: 'TDS', duration: '5 days', route: 'Oral', instructions: 'After food' }, 'Tablet');
    expect(parts).toEqual(['Take 2 tablets each time', '500 mg', 'TDS', '5 days', 'Oral', 'After food']);
  });

  it('falls back to the old wording when there is no dose per time', () => {
    expect(howToTakeParts({ dose_qty: null, dosage: '500 mg', frequency: 'PRN' }, 'Tablet')).toEqual(['500 mg', 'PRN']);
  });
});
