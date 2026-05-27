function toDateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function addDays(dateOnly, days) {
  if (!dateOnly) return null;
  const dt = new Date(`${dateOnly}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function latestSettlement(settlements) {
  if (!Array.isArray(settlements) || settlements.length === 0) return null;
  return [...settlements].sort((a, b) => {
    const aCreated = new Date(a.created_at || 0).getTime();
    const bCreated = new Date(b.created_at || 0).getTime();
    if (bCreated !== aCreated) return bCreated - aCreated;
    return String(b.period_end || '').localeCompare(String(a.period_end || ''));
  })[0];
}

export function getPostSettlementCardSummary(balance, detail, settlements) {
  const lastSettlement = latestSettlement(settlements);
  const lastEnd = toDateOnly(lastSettlement?.period_end);
  const visibleRows = lastEnd
    ? (detail || []).filter((row) => toDateOnly(row.day) > lastEnd)
    : (detail || []);

  const totals = visibleRows.reduce((acc, row) => {
    acc.sales += Number(row.total_sales || 0);
    acc.commission += Number(row.total_commission || 0);
    acc.prizes += Number(row.prizes_paid || 0);
    acc.net += Number(row.balance_day || 0);
    return acc;
  }, { sales: 0, commission: 0, prizes: 0, net: 0 });

  return {
    totalSales: totals.sales,
    totalCommission: totals.commission,
    totalPrizes: totals.prizes,
    netPeriod: totals.net,
    periodStart: lastEnd ? addDays(lastEnd, 1) : toDateOnly(balance?.period_start),
    periodEnd: toDateOnly(balance?.period_end),
  };
}
