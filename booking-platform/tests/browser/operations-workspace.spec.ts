import { test, expect, capture, expectNoHorizontalOverflow } from "./fixtures";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  reference: "MX-TEST-2410",
  product: "FLIGHT",
  status: "TICKETED",
  total_minor: "654000",
  created_at: "2026-10-31T06:00:00.000Z",
  supplier_booking_id: "SYNTHETIC-SUPPLIER",
  supplier_response: { secret_detail: "Technical-only fixture" },
};
test('finance records checked PayGlocal settlement with explicit evidence and one stable request',async({page,provider},info)=>{
 const id='22222222-2222-4222-8222-222222222222';provider.overrides['GET /api/admin/refunds']={body:{rows:[{id,reference:'MX-SYNTHETIC-REFUND',provider:'PAYGLOCAL',status:'PROCESSING',amount_minor:'2000',gateway_refund_id:'gl_synthetic_refund',created_at:'2026-10-31T06:00:00Z'}],total:1,page:1,hasMore:false}};provider.overrides[`POST /api/admin/refunds/${id}/settlement`]={body:{id,status:'COMPLETED',message:'Settlement recorded from checked evidence. No new refund request was sent.'}};
 await page.goto('/operations?desk=refunds');const records=page.getByRole('region',{name:'refunds records',exact:true});await expect(records).toContainText('MX-SYNTHETIC-REFUND');await records.getByRole('button',{name:'Open record →',exact:true}).click();await page.getByRole('button',{name:'Record verified refund settlement →',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Record verified refund settlement',exact:true})});await dialog.getByLabel('Bank / provider settlement reference',{exact:true}).fill('SYNTHETIC-BANK-001');await dialog.getByLabel('Settlement date',{exact:true}).fill('2026-10-31');await dialog.getByLabel('Evidence checked and settlement notes',{exact:true}).fill('Synthetic checked settlement evidence for preview only.');await dialog.getByRole('button',{name:'Record verified settlement',exact:true}).click();expect(provider.requests(`/api/admin/refunds/${id}/settlement`)).toHaveLength(0);await dialog.getByRole('checkbox',{name:'I verified this refund is settled using bank or provider evidence.'}).check();await expectNoHorizontalOverflow(page);await capture(page,info,'checked-refund-settlement');await dialog.getByRole('button',{name:'Record verified settlement',exact:true}).click();await expect(dialog).toContainText('Settlement recorded from checked evidence');const calls=provider.requests(`/api/admin/refunds/${id}/settlement`);expect(calls).toHaveLength(1);expect(calls[0].body).toMatchObject({acceptedAmountMinor:2000,gatewayRefundId:'gl_synthetic_refund',attested:true,bankReference:'SYNTHETIC-BANK-001'});
});
test("viewer gets a readable booking register and no privileged desks or actions", async ({
  page,
  provider,
}, info) => {
  provider.overrides["GET /api/admin/context"] = {
    body: {
      userId: "viewer",
      name: "Read-only staff",
      permissions: ["bookings:read"],
    },
  };
  provider.overrides["GET /api/admin/bookings"] = {
    body: { rows: [row], total: 1, page: 1, hasMore: false },
  };
  await page.goto("/operations");
  await expect(
    page.getByRole("heading", { name: "Booking journeys", exact: true }),
  ).toBeVisible();
  const records = page.getByRole("region", {
    name: "bookings records",
    exact: true,
  });
  await expect(records).toContainText("MX-TEST-2410");
  await expect(records).toContainText("6,540");
  await expect(records).not.toContainText("Technical-only fixture");
  await expect(
    page.getByRole("link", { name: "Corporate accounts", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Booking reports ↗", exact: true }),
  ).toHaveCount(0);
  await records
    .getByRole("button", { name: "Open record →", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Ticketed");
  await expect(
    dialog.getByRole("heading", { name: "Next action", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, "viewer-booking-register");
  expect(provider.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
});
test("search and desk navigation survive browser Back and export retains applied filters", async ({
  page,
  provider,
}) => {
  provider.overrides["GET /api/admin/bookings"] = {
    body: { rows: [row], total: 1, hasMore: false },
  };
  provider.overrides["GET /api/admin/companies"] = {
    body: { rows: [], total: 0, hasMore: false },
  };
  await page.goto("/operations");
  await page.getByLabel("Find a record", { exact: true }).fill("MX-TEST-2410");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(/q=MX-TEST-2410/);
  await expect
    .poll(() => provider.requests("/api/admin/bookings").at(-1)?.query.q)
    .toBe("MX-TEST-2410");
  await page.getByRole("button", { name: "Export view", exact: true }).click();
  const exportDialog = page.getByRole("dialog");
  await expect(exportDialog.locator("input[name=q]")).toHaveValue(
    "MX-TEST-2410",
  );
  await page.keyboard.press("Escape");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("link", { name: "Corporate accounts", exact: true })
    .click();
  await expect(page).toHaveURL(/desk=companies/);
  await page.goBack();
  await expect(page.getByLabel("Find a record", { exact: true })).toHaveValue(
    "MX-TEST-2410",
  );
  await expect(
    page.getByRole("region", { name: "bookings records", exact: true }),
  ).toContainText(row.reference);
});
test("supplier checks use the selected record without an internal-ID form", async ({
  page,
  provider,
}, info) => {
  provider.overrides["GET /api/admin/bookings"] = {
    body: { rows: [row], total: 1, hasMore: false },
  };
  provider.overrides[`POST /api/admin/bookings/${row.id}/reconcile`] = {
    body: { message: "Synthetic supplier status checked." },
  };
  await page.goto("/operations");
  await page
    .getByRole("button", { name: "Open record →", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Check supplier booking status →",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", {
      name: "Check supplier booking status",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Check existing booking", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Synthetic supplier status checked.",
  );
  expect(
    provider.requests(`/api/admin/bookings/${row.id}/reconcile`),
  ).toHaveLength(1);
  await capture(page, info, "supplier-check-result");
});
test("failed access checks never show an empty register or privileged navigation", async ({
  page,
  provider,
}) => {
  provider.overrides["GET /api/admin/context"] = {
    status: 403,
    body: { error: "Enable authenticator protection for staff access." },
  };
  await page.goto("/operations");
  await expect(
    page.getByRole("heading", {
      name: "Operations access required",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Operations desks" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No records to show.", exact: true }),
  ).toHaveCount(0);
  expect(provider.requests("/api/admin/bookings")).toHaveLength(0);
});


test("hotel cancellation follow-up stays visible with supplier and next-check progress",async({page,provider},info)=>{
  provider.overrides["GET /api/admin/cancellations"]={body:{rows:[{id:"22222222-2222-4222-8222-222222222222",reference:"MX-HOTEL-PENDING",product:"HOTEL",status:"SUPPLIER_PENDING",supplier_status:"CANCELLATION_PENDING",last_checked_at:"2026-11-01T10:00:00Z",next_check:"2026-11-02T10:00:00Z",follow_up_required_at:"2026-11-01T10:00:00Z",poll_attempts:9,is_partial:false,reason:"Fixture change of plans",created_at:"2026-10-30T10:00:00Z"}],total:1,page:1,hasMore:false}};
  await page.goto("/operations?desk=cancellations");const records=page.getByRole("region",{name:"cancellations records",exact:true});
  await expect(records).toContainText("MX-HOTEL-PENDING");await expect(records).toContainText("Staff follow-up required");await expect(records).toContainText("Cancellation pending");
  await page.getByLabel("Progress",{exact:true}).selectOption("FOLLOW_UP_REQUIRED");await page.getByRole("button",{name:"Apply filters",exact:true}).click();await expect.poll(()=>provider.requests("/api/admin/cancellations").at(-1)?.query.status).toBe("FOLLOW_UP_REQUIRED");
  await expectNoHorizontalOverflow(page);await capture(page,info,"hotel-cancellation-daily-follow-up");
});
