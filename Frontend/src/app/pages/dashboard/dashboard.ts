import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

import { Sales } from '../sales/sales';
import { Finance } from '../finance/finance';
import { Memo } from '../memo/memo';
import { Invoice } from '../invoice/invoice';
import { Profile } from '../profile/profile';
import { Delivery } from '../delivery/delivery';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective, Sales, Finance, Memo, Invoice, Profile, Delivery],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {

  activeNav = 'dashboard';
  customerId = '';
  loading = true;
  summaryData: any = null;
  searchQuery = '';
  startDate = '';
  endDate = '';
  activePreset = 'all';
  sidebarCollapsed = false;

  kpis = {
    orders: { total: 0, open: 0, trend: 0 },
    deliveries: { total: 0, pending: 0, shipped: 0 },
    invoices: { total: 0, overdue: 0 },
    value: 0,
    creditMemos: { total: 0, value: 0 }
  };

  recentActivities: any[] = [];
  filteredActivities: any[] = [];

  navItems = [
    { label: 'Dashboard', key: 'dashboard', icon: 'dashboard' },
    { label: 'Sales Orders', key: 'sales', icon: 'shopping_bag' },
    { label: 'Finance', key: 'finance', icon: 'account_balance_wallet' },
    { label: 'Deliveries', key: 'delivery', icon: 'local_shipping' },
    { label: 'Invoices', key: 'invoice', icon: 'receipt_long' },
    { label: 'Credit/Debit', key: 'memo', icon: 'description' },
    { label: 'My Profile', key: 'profile', icon: 'account_circle' },
  ];

  datePresets = [
    { label: 'All Time', key: 'all' },
    { label: 'Last 30d', key: '30d' },
    { label: 'Last 90d', key: '90d' },
    { label: 'This Year', key: 'ytd' },
  ];

  public chartData: ChartData<'doughnut'> = {
    labels: ['Sales', 'Deliveries', 'Invoices', 'Memos'],
    datasets: [{
      data: [],
      backgroundColor: ['#E85D5D', '#f97316', '#8B5CF6', '#06b6d4'],
      borderWidth: 0,
      hoverOffset: 15
    }]
  };

  public pieChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      }
    },
    animation: { animateRotate: true, animateScale: true, duration: 800 }
  };

  public agingChartData: ChartData<'bar'> = {
    labels: ['Current', '1–30 Days', '31–60 Days', '60+ Days'],
    datasets: [{
      label: 'Outstanding (EUR)',
      data: [0, 0, 0, 0],
      backgroundColor: ['rgba(16,185,129,0.85)', 'rgba(245,158,11,0.85)', 'rgba(239,68,68,0.85)', 'rgba(127,29,29,0.85)'],
      borderRadius: 10,
      borderSkipped: false,
      barThickness: 36
    }]
  };

  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 12,
        cornerRadius: 10,
        callbacks: { label: (ctx) => `€ ${(ctx.parsed.y ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', callback: (v) => '€' + Number(v).toLocaleString() }, border: { display: false } },
      x: { grid: { display: false }, ticks: { color: '#64748b' }, border: { display: false } }
    }
  };

  public lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [{
      label: 'Revenue (EUR)',
      data: [],
      backgroundColor: '#E85D5D',
      borderColor: '#E85D5D',
      pointBackgroundColor: '#E85D5D',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#E85D5D',
      fill: true,
      tension: 0.45,
      pointRadius: 5
    }]
  };

  public lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 12,
        cornerRadius: 10,
        callbacks: { label: (ctx) => `€ ${(ctx.parsed.y ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', callback: (v) => '€' + Number(v).toLocaleString() }, border: { display: false } },
      x: { grid: { display: false }, ticks: { color: '#64748b' }, border: { display: false } }
    }
  };

  public topSalesData: ChartData<'bar'> = {
    labels: ['Orders', 'Inquiries'],
    datasets: [{
      label: 'Volume',
      data: [0, 0],
      backgroundColor: ['rgba(232,93,93,0.85)', 'rgba(139,92,246,0.85)'],
      borderRadius: 8,
      barThickness: 22
    }]
  };

  public horizontalBarOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false } },
      y: { grid: { display: false }, border: { display: false } }
    }
  };

  constructor(private router: Router, private http: HttpClient) { }

  ngOnInit() {
    this.customerId = localStorage.getItem('customer_id') || '';
    if (!this.customerId) { this.router.navigate(['/login']); return; }
    this.fetchOverview();
  }

  fetchOverview() {
    this.loading = true;
    this.http.get<any>(`http://localhost:3000/dashboard/overview?customer_id=${this.customerId}`)
      .subscribe({
        next: (res) => {
          this.summaryData = res;
          this.processDashboardData(res);
          this.loading = false;
        },
        error: (err) => { console.error('Dashboard error', err); this.loading = false; }
      });
  }

  processDashboardData(res: any) {
    if (!res) return;
    const getList = (obj: any, key: string) => {
      const it = obj?.[key]?.item;
      return Array.isArray(it) ? it : (it ? [it] : []);
    };

    const sales = getList(res.sales, 'ET_DASH');
    const deliveries = getList(res.delivery, 'ET_DELIVERY');
    const invoices = getList(res.invoice, 'ET_INVOICE');
    const memos = getList(res.memo, 'ET_MEMO');
    const finance = getList(res.finance, 'ET_FIN');

    const start = this.startDate ? new Date(this.startDate) : null;
    const end = this.endDate ? new Date(this.endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const filterByDate = (list: any[], dateKey: string) => {
      if (!start && !end) return list;
      return list.filter(item => {
        const d = this.parseDate(item[dateKey]);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    };

    const fSales = filterByDate(sales, 'ERDAT');
    const fDeliveries = filterByDate(deliveries, 'ERDAT'); // Changed from WADAT to ensure pending show up
    const fInvoices = filterByDate(invoices, 'FKDAT');
    const fMemos = filterByDate(memos, 'FKDAT'); // Memos use FKDAT
    const fFinance = filterByDate(finance, 'FKDAT');

    this.chartData = {
      labels: ['Sales', 'Deliveries', 'Invoices', 'Memos'],
      datasets: [{
        data: [fSales.length, fDeliveries.length, fInvoices.length, fMemos.length],
        backgroundColor: ['#E85D5D', '#f97316', '#8B5CF6', '#06b6d4'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    };

    const today = new Date();
    let buckets = [0, 0, 0, 0];
    fFinance.forEach((item: any) => {
      const billDate = this.parseDate(item.FKDAT);
      if (billDate) {
        const dueDate = new Date(billDate.getTime() + (30 * 24 * 60 * 60 * 1000));
        const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const val = parseFloat(item.NETWR) || 0;
        if (diffDays <= 0) buckets[0] += val;
        else if (diffDays <= 30) buckets[1] += val;
        else if (diffDays <= 60) buckets[2] += val;
        else buckets[3] += val;
      }
    });

    this.agingChartData = {
      ...this.agingChartData,
      datasets: [{ ...this.agingChartData.datasets[0], data: buckets }]
    };

    const monthMap: Record<string, number> = {};
    fFinance.forEach((item: any) => {
      const d = this.parseDate(item.FKDAT);
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = (monthMap[key] || 0) + (parseFloat(item.NETWR) || 0);
      }
    });
    const sortedMonths = Object.keys(monthMap).sort();
    this.lineChartData = {
      labels: sortedMonths.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' });
      }),
      datasets: [{ ...this.lineChartData.datasets[0], data: sortedMonths.map(k => monthMap[k]) }]
    };

    const inq = fSales.filter((s: any) => s.AUART === 'AF' || s.AUART === 'AA').length;
    const ord = fSales.length - inq;
    this.topSalesData = {
      ...this.topSalesData,
      datasets: [{ ...this.topSalesData.datasets[0], data: [ord, inq] }]
    };

    this.kpis.orders.total = fSales.length;
    this.kpis.orders.open = fSales.filter((s: any) => (s.GBSTK || s.gbstk) === 'A').length;
    this.kpis.deliveries.total = fDeliveries.length;
    this.kpis.deliveries.shipped = fDeliveries.filter((d: any) => d.WADAT && d.WADAT !== '0000-00-00' && d.WADAT !== '00000000').length;
    this.kpis.deliveries.pending = fDeliveries.length - this.kpis.deliveries.shipped;
    this.kpis.invoices.total = fInvoices.length;
    this.kpis.invoices.overdue = fFinance.filter((f: any) => {
      const d = this.parseDate(f.FKDAT);
      if (!d) return false;
      const due = new Date(d.getTime() + (30 * 24 * 60 * 60 * 1000));
      return today > due;
    }).length;
    this.kpis.value = fFinance.reduce((sum: number, f: any) => sum + (parseFloat(f.NETWR) || 0), 0);
    this.kpis.creditMemos.total = fMemos.length;
    this.kpis.creditMemos.value = fMemos.reduce((sum: number, m: any) => sum + (parseFloat(m.NETWR) || 0), 0);

    const combined = [
      ...fSales.map((s: any) => ({ id: s.VBELN, type: 'Order', date: s.ERDAT, val: s.NETWR, status: 'Confirmed' })),
      ...fDeliveries.map((d: any) => ({ id: d.VBELN, type: 'Delivery', date: d.ERDAT, val: '-', status: (d.WADAT && d.WADAT !== '0000-00-00' && d.WADAT !== '00000000') ? 'Shipped' : 'Pending' })),
      ...fInvoices.map((i: any) => ({ id: i.VBELN, type: 'Invoice', date: i.FKDAT, val: i.NETWR, status: 'Billed' })),
      ...fMemos.map((m: any) => ({ id: m.VBELN, type: 'Memo', date: m.ERDAT, val: m.NETWR, status: 'Processed' }))
    ];

    this.recentActivities = combined
      .sort((a, b) => {
        const da = this.parseDate(a.date)?.getTime() || 0;
        const db = this.parseDate(b.date)?.getTime() || 0;
        return db - da;
      })
      .slice(0, 20);

    let filtered = this.recentActivities;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.id.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.status.toLowerCase().includes(q)
      );
    }
    this.filteredActivities = filtered;
  }

  applyPreset(key: string) {
    this.activePreset = key;
    const today = new Date();
    if (key === 'all') { this.startDate = ''; this.endDate = ''; }
    else if (key === '30d') {
      const d = new Date(today); d.setDate(d.getDate() - 30);
      this.startDate = d.toISOString().split('T')[0];
      this.endDate = today.toISOString().split('T')[0];
    } else if (key === '90d') {
      const d = new Date(today); d.setDate(d.getDate() - 90);
      this.startDate = d.toISOString().split('T')[0];
      this.endDate = today.toISOString().split('T')[0];
    } else if (key === 'ytd') {
      this.startDate = `${today.getFullYear()}-01-01`;
      this.endDate = today.toISOString().split('T')[0];
    }
    this.applyFilter();
  }

  applyFilter() {
    if (this.summaryData) { this.processDashboardData(this.summaryData); }
  }

  parseDate(raw: string): Date | null {
    if (!raw || raw === '00000000' || raw === '0000-00-00') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.substring(0, 10)); return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{8}$/.test(raw)) {
      const d = new Date(`${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  onSearch(event: any) {
    this.searchQuery = event.target.value;
    this.applyFilter();
  }

  getDeliveryRate(): number {
    const t = this.kpis.deliveries.total;
    return t ? Math.round((this.kpis.deliveries.shipped / t) * 100) : 0;
  }

  getInvoiceOverdueRate(): number {
    const t = this.kpis.invoices.total;
    return t ? Math.round((this.kpis.invoices.overdue / t) * 100) : 0;
  }

  logout() {
    localStorage.removeItem('customer_id');
    this.router.navigate(['/login']);
  }
}