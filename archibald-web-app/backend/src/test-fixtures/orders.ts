// Test fixtures for order integration tests

export const singlePackageOrderFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'TD1272.314',
      quantity: 5,
      price: 0, // Bot will fetch
    },
  ],
};

export const multiPackageHighQuantityFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'H129FSQ.104.023',
      quantity: 10, // Should select 5-piece package
      price: 0,
    },
  ],
};

export const multiPackageLowQuantityFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'H129FSQ.104.023',
      quantity: 3, // Should select 1-piece package
      price: 0,
    },
  ],
};

export const multiPackageThresholdFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'H129FSQ.104.023',
      quantity: 5, // Exactly at threshold, should select 5-piece
      price: 0,
    },
  ],
};

export const invalidQuantityBelowMinFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'H129FSQ.104.023',
      quantity: 2, // Below minQty of selected variant
      price: 0,
    },
  ],
};

export const invalidQuantityNotMultipleFixture = {
  customerName: 'Fresis Soc Cooperativa',
  items: [
    {
      articleCode: 'H129FSQ.104.023',
      quantity: 7, // Not multiple of multipleQty
      price: 0,
    },
  ],
};
