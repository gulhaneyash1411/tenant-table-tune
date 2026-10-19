// Run with `npm test` (Node's built-in runner; no extra dependencies).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBill,
  discountLabel,
  itemsSubtotal,
  orderBillColumns,
  readBillCharges,
  readOrderBill,
  readTaxRate,
  sanitizeAmountInput,
  validateBillCharges,
} from "./billing.ts";

const rs = (n: number) => `₹${n}`;

describe("computeBill", () => {
  it("leaves totals unchanged with no discount and no service charge", () => {
    const b = computeBill({ itemsSubtotal: 1000 });
    assert.equal(b.discountAmount, 0);
    assert.equal(b.serviceCharge, 0);
    assert.equal(b.total, 1000);
  });

  it("takes a flat ₹100 off ₹1,000", () => {
    const b = computeBill({ itemsSubtotal: 1000, discountType: "rupees", discountValue: 100 });
    assert.equal(b.discountAmount, 100);
    assert.equal(b.subtotalAfterDiscount, 900);
    assert.equal(b.total, 900);
  });

  it("takes 10% off ₹1,000", () => {
    const b = computeBill({ itemsSubtotal: 1000, discountType: "percentage", discountValue: 10 });
    assert.equal(b.discountAmount, 100);
    assert.equal(b.subtotalAfterDiscount, 900);
    assert.equal(b.total, 900);
  });

  it("adds a ₹50 service charge", () => {
    assert.equal(computeBill({ itemsSubtotal: 1000, serviceCharge: 50 }).total, 1050);
  });

  it("combines a ₹100 discount with a ₹50 service charge", () => {
    const b = computeBill({
      itemsSubtotal: 1000,
      discountType: "rupees",
      discountValue: 100,
      serviceCharge: 50,
    });
    assert.equal(b.total, 950);
  });

  it("matches the worked example: ₹2,000, 10% off, ₹100 service", () => {
    const b = computeBill({
      itemsSubtotal: 2000,
      discountType: "percentage",
      discountValue: 10,
      serviceCharge: 100,
    });
    assert.equal(b.discountAmount, 200);
    assert.equal(b.subtotalAfterDiscount, 1800);
    assert.equal(b.total, 1900);
  });

  it("never goes negative at 100%", () => {
    const b = computeBill({
      itemsSubtotal: 1000,
      discountType: "percentage",
      discountValue: 100,
      taxRate: 5,
    });
    assert.equal(b.discountAmount, 1000);
    assert.equal(b.tax, 0);
    assert.equal(b.total, 0);
  });

  it("caps a percentage above 100 at 100", () => {
    const b = computeBill({ itemsSubtotal: 1000, discountType: "percentage", discountValue: 150 });
    assert.equal(b.discountValue, 100);
    assert.equal(b.discountAmount, 1000);
    assert.equal(b.total, 0);
  });

  it("caps a flat discount at the items subtotal", () => {
    const b = computeBill({
      itemsSubtotal: 300,
      discountType: "rupees",
      discountValue: 500,
      serviceCharge: 20,
    });
    assert.equal(b.discountAmount, 300);
    assert.equal(b.subtotalAfterDiscount, 0);
    assert.equal(b.total, 20);
  });

  it("treats empty, negative and junk inputs as zero", () => {
    for (const bad of ["", "abc", -50, NaN, null, undefined, Infinity] as unknown[]) {
      const b = computeBill({
        itemsSubtotal: 1000,
        discountValue: bad as number,
        serviceCharge: bad as number,
        taxRate: bad as number,
      });
      assert.equal(b.total, 1000, `input ${String(bad)}`);
    }
    // An unknown type falls back to a flat discount rather than throwing.
    const b = computeBill({
      itemsSubtotal: 1000,
      discountType: "bogus" as never,
      discountValue: 100,
    });
    assert.equal(b.discountType, "rupees");
    assert.equal(b.total, 900);
  });

  it("handles decimals to the paisa", () => {
    const b = computeBill({
      itemsSubtotal: 999.99,
      discountType: "percentage",
      discountValue: 12.5,
      serviceCharge: 10.25,
    });
    assert.equal(b.discountAmount, 125);
    assert.equal(b.subtotalAfterDiscount, 874.99);
    assert.equal(b.total, 885.24);
  });

  it("recalculates when switching between rupees and percent", () => {
    const base = { itemsSubtotal: 1000, discountValue: 20 };
    assert.equal(computeBill({ ...base, discountType: "rupees" }).total, 980);
    assert.equal(computeBill({ ...base, discountType: "percentage" }).total, 800);
    assert.equal(computeBill({ ...base, discountType: "rupees" }).total, 980);
  });

  it("taxes the discounted amount and adds service charge and delivery after tax", () => {
    const b = computeBill({
      itemsSubtotal: 1000,
      taxRate: 5,
      discountType: "percentage",
      discountValue: 10,
      serviceCharge: 50,
      deliveryFee: 40,
    });
    assert.equal(b.taxableAmount, 900);
    assert.equal(b.tax, 45);
    assert.equal(b.total, 900 + 45 + 50 + 40);
  });

  it("keeps the original tax rules when there is no discount or service charge", () => {
    // The formulas this replaced (public-orders.server.ts and NewOrderDialog).
    const oldTax = (subtotal: number, pct: number) => Math.round(subtotal * pct) / 100;
    for (const subtotal of [0, 1, 99, 250, 333.33, 1000, 1234.56, 99999]) {
      for (const pct of [0, 5, 12, 18, 28, 2.5]) {
        for (const delivery of [0, 30]) {
          const b = computeBill({ itemsSubtotal: subtotal, taxRate: pct, deliveryFee: delivery });
          assert.equal(b.tax, oldTax(subtotal, pct), `tax ${subtotal} @ ${pct}%`);
          assert.ok(
            Math.abs(b.total - (subtotal + oldTax(subtotal, pct) + delivery)) < 0.005,
            `total ${subtotal} @ ${pct}%`,
          );
        }
      }
    }
  });

  it("follows item changes: the percentage is taken from the new subtotal", () => {
    const charges = { discountType: "percentage" as const, discountValue: 10, serviceCharge: 25 };
    const items = [
      { price: 200, quantity: 2 },
      { price: 150, quantity: 1 },
    ];
    assert.equal(
      computeBill({ itemsSubtotal: itemsSubtotal(items), ...charges }).total,
      550 - 55 + 25,
    );
    items[0].quantity = 4;
    assert.equal(
      computeBill({ itemsSubtotal: itemsSubtotal(items), ...charges }).total,
      950 - 95 + 25,
    );
    items[1].price = 250;
    assert.equal(
      computeBill({ itemsSubtotal: itemsSubtotal(items), ...charges }).total,
      1050 - 105 + 25,
    );
  });

  it("backs tax out of a tax-inclusive bill instead of adding it", () => {
    const b = computeBill({
      itemsSubtotal: 1050,
      taxRate: 5,
      taxInclusive: true,
      serviceCharge: 10,
    });
    assert.equal(b.tax, 50);
    assert.equal(b.total, 1060);
  });
});

describe("settings", () => {
  it("defaults a tenant that never set anything", () => {
    assert.deepEqual(readBillCharges(null), {
      discountType: "rupees",
      discountValue: 0,
      serviceCharge: 0,
    });
    assert.deepEqual(readBillCharges({ tax_rate: "5" }), {
      discountType: "rupees",
      discountValue: 0,
      serviceCharge: 0,
    });
    assert.equal(readTaxRate({}), 0);
  });

  it("reads strings as typed into the form", () => {
    assert.deepEqual(
      readBillCharges({
        discount_type: "percentage",
        discount_value: "12.5",
        service_charge: "40",
      }),
      { discountType: "percentage", discountValue: 12.5, serviceCharge: 40 },
    );
    assert.equal(readTaxRate({ tax_rate: "18" }), 18);
    assert.equal(readTaxRate({ tax_rate: "250" }), 100);
  });

  it("validates before save", () => {
    assert.equal(
      validateBillCharges({ discountType: "rupees", discountValue: "", serviceCharge: "" }),
      null,
    );
    assert.equal(
      validateBillCharges({ discountType: "percentage", discountValue: "100", serviceCharge: "0" }),
      null,
    );
    assert.match(
      validateBillCharges({
        discountType: "percentage",
        discountValue: "101",
        serviceCharge: "0",
      }) ?? "",
      /100%/,
    );
    assert.match(
      validateBillCharges({ discountType: "rupees", discountValue: "-1", serviceCharge: "0" }) ??
        "",
      /Discount/,
    );
    assert.match(
      validateBillCharges({ discountType: "rupees", discountValue: "0", serviceCharge: "x" }) ?? "",
      /Service/,
    );
    assert.match(
      validateBillCharges({ discountType: "flat", discountValue: "0", serviceCharge: "0" }) ?? "",
      /type/,
    );
  });

  it("sanitizes typing in the amount boxes", () => {
    assert.equal(sanitizeAmountInput("12", ""), "12");
    assert.equal(sanitizeAmountInput("12.", "12"), "12.");
    assert.equal(sanitizeAmountInput("12.55", "12.5"), "12.55");
    assert.equal(sanitizeAmountInput("12.555", "12.55"), "12.55");
    assert.equal(sanitizeAmountInput("-5", "5"), "5");
    assert.equal(sanitizeAmountInput("1e3", "1"), "1");
    assert.equal(sanitizeAmountInput("abc", "7"), "7");
    assert.equal(sanitizeAmountInput("007", "0"), "7");
    assert.equal(sanitizeAmountInput("1,000", ""), "1000");
    assert.equal(sanitizeAmountInput("", "5"), "");
    assert.equal(sanitizeAmountInput("101", "10", 100), "10");
    assert.equal(sanitizeAmountInput("100", "10", 100), "100");
  });
});

describe("saved orders", () => {
  it("reads back exactly what was charged, so previews, PDF and stored totals agree", () => {
    const bill = computeBill({
      itemsSubtotal: 2000,
      taxRate: 5,
      discountType: "percentage",
      discountValue: 10,
      serviceCharge: 100,
      deliveryFee: 30,
    });
    const row = { ...orderBillColumns(bill), delivery_fee: 30 };
    const back = readOrderBill(row);
    for (const k of [
      "itemsSubtotal",
      "discountType",
      "discountValue",
      "discountAmount",
      "subtotalAfterDiscount",
      "tax",
      "serviceCharge",
      "deliveryFee",
      "total",
    ] as const) {
      assert.equal(back[k], bill[k], k);
    }
  });

  it("reads Postgres numeric strings", () => {
    const back = readOrderBill({
      subtotal: "1000.00",
      discount_type: "rupees",
      discount_value: "100.00",
      discount_amount: "100.00",
      service_charge: "50.00",
      tax: "0.00",
      total: "950.00",
    });
    assert.equal(back.discountAmount, 100);
    assert.equal(back.subtotalAfterDiscount, 900);
    assert.equal(back.total, 950);
  });

  it("renders an order from before discounts existed as no discount, no service charge", () => {
    const old = { subtotal: 500, tax: 25, delivery_fee: 0, total: 525 };
    const back = readOrderBill(old);
    assert.equal(back.discountType, "rupees");
    assert.equal(back.discountAmount, 0);
    assert.equal(back.serviceCharge, 0);
    assert.equal(back.subtotalAfterDiscount, 500);
    assert.equal(back.total, 525);
    assert.equal(readOrderBill(null).total, 0);
  });

  it("labels the discount with its type and value", () => {
    assert.equal(
      discountLabel({ discountType: "percentage", discountValue: 10 }, rs),
      "Discount (10%)",
    );
    assert.equal(
      discountLabel({ discountType: "percentage", discountValue: 12.5 }, rs),
      "Discount (12.5%)",
    );
    assert.equal(
      discountLabel({ discountType: "rupees", discountValue: 100 }, rs),
      "Discount (₹100 flat)",
    );
  });
});
