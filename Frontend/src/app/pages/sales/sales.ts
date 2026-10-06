import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './sales.html'
})
export class Sales implements OnInit {
  items: any[] = [];
  filteredItems: any[] = [];
  loading = true;
  error = '';
  activePreset = 'all';

  searchQuery = '';
  startDate = '';
  endDate = '';

  metrics = {
    total: 0,
    inq: 0,
    ord: 0,
    value: 0,
    avgValue: 0
  };

  // Monthly Orders Trend
  public ordersTrend: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        label: 'Sales Orders',
        data: [],
        backgroundColor: 'rgba(232,93,93,0.85)',
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 20
      },
      {
        label: 'Inquiries',
        data: [],
        backgroundColor: 'rgba(139,92,246,0.85)',
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 20
      }
    ]
  };

  public trendOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { size: 10, weight: 'bold' }, color: '#64748b', boxWidth: 10, padding: 16, usePointStyle: true, pointStyleWidth: 10 }
      },
      tooltip: {
        backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } } }
    },
    animation: { duration: 700 }
  };

  // Value Trend (line)
  public valueTrend: ChartData<'line'> = {
    labels: [],
    datasets: [{
      label: 'Net Value (EUR)',
      data: [],
      borderColor: '#E85D5D',
      backgroundColor: 'rgba(232,93,93,0.07)',
      fill: true,
      tension: 0.45,
      pointBackgroundColor: '#E85D5D',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };

  public lineOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: false,
        callbacks: { label: (ctx) => `€ ${(ctx.parsed.y ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, callback: (v) => '€' + Number(v).toLocaleString() } },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } } }
    },
    animation: { duration: 700 }
  };

  datePresets = [
    { label: 'All', key: 'all' },
    { label: '30d', key: '30d' },
    { label: '90d', key: '90d' },
    { label: 'YTD', key: 'ytd' }
  ];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const customerId = localStorage.getItem('customer_id');
    if (!customerId) { this.error = 'Not signed in.'; this.loading = false; return; }

    this.http.get<any>(`http://localhost:3000/sales?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          const et = res?.ET_DASH?.item;
          this.items = Array.isArray(et) ? et : (et ? [et] : []);
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Sales error:', err);
          this.error = 'Failed to load sales data.';
          this.loading = false;
        }
      });
  }

  buildCharts() {
    const monthOrderMap: Record<string, number> = {};
    const monthInqMap: Record<string, number> = {};
    const monthValueMap: Record<string, number> = {};

    this.filteredItems.forEach(item => {
      const d = this.parseDate(item.ERDAT);
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const isInq = item.AUART === 'AF' || item.AUART === 'AA';
        if (isInq) monthInqMap[key] = (monthInqMap[key] || 0) + 1;
        else monthOrderMap[key] = (monthOrderMap[key] || 0) + 1;
        monthValueMap[key] = (monthValueMap[key] || 0) + (parseFloat(item.NETWR) || 0);
      }
    });

    const allKeys = [...new Set([...Object.keys(monthOrderMap), ...Object.keys(monthInqMap)])].sort();
    const labels = allKeys.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }); });

    this.ordersTrend = {
      labels,
      datasets: [
        { ...this.ordersTrend.datasets[0], data: allKeys.map(k => monthOrderMap[k] || 0) },
        { ...this.ordersTrend.datasets[1], data: allKeys.map(k => monthInqMap[k] || 0) }
      ]
    };

    const valKeys = Object.keys(monthValueMap).sort();
    this.valueTrend = {
      labels: valKeys.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }); }),
      datasets: [{ ...this.valueTrend.datasets[0], data: valKeys.map(k => monthValueMap[k]) }]
    };
  }

  calculateMetrics() {
    this.metrics.total = this.filteredItems.length;
    this.metrics.inq = this.filteredItems.filter(i => i.AUART === 'AF' || i.AUART === 'AA').length;
    this.metrics.ord = this.metrics.total - this.metrics.inq;
    this.metrics.value = this.filteredItems.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
    this.metrics.avgValue = this.metrics.total ? this.metrics.value / this.metrics.total : 0;
  }

  applyPreset(key: string) {
    this.activePreset = key;
    const today = new Date();
    if (key === 'all') { this.startDate = ''; this.endDate = ''; }
    else if (key === '30d') { const d = new Date(today); d.setDate(d.getDate() - 30); this.startDate = d.toISOString().split('T')[0]; this.endDate = today.toISOString().split('T')[0]; }
    else if (key === '90d') { const d = new Date(today); d.setDate(d.getDate() - 90); this.startDate = d.toISOString().split('T')[0]; this.endDate = today.toISOString().split('T')[0]; }
    else if (key === 'ytd') { this.startDate = `${today.getFullYear()}-01-01`; this.endDate = today.toISOString().split('T')[0]; }
    this.applyFilters();
  }

  onFilterChange() { this.applyFilters(); }

  /** Strip leading zeros from SAP document numbers */
  stripZeros(val: string): string {
    if (!val) return '';
    return val.replace(/^0+/, '') || val;
  }

  /** Parse SAP dates: YYYY-MM-DD or YYYYMMDD */
  parseDate(raw: string): Date | null {
    if (!raw || raw === '00000000' || raw === '0000-00-00') return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.substring(0, 10)); return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{8}$/.test(raw)) {
      const d = new Date(`${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}`);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  applyFilters() {
    const start = this.startDate ? new Date(this.startDate) : null;
    const end   = this.endDate   ? new Date(this.endDate)   : null;
    if (end) end.setHours(23, 59, 59, 999);

    this.filteredItems = this.items.filter(item => {
      const matchSearch =
        (item.VBELN || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (item.AUART || '').toLowerCase().includes(this.searchQuery.toLowerCase());

      let matchDate = true;
      const d = this.parseDate(item.ERDAT);
      if (d) {
        if (start && d < start) matchDate = false;
        if (end   && d > end)   matchDate = false;
      } else if (start || end) { matchDate = false; }
      return matchSearch && matchDate;
    });

    this.calculateMetrics();
    this.buildCharts();
  }

  getFilteredValue(): number {
    return this.filteredItems.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
  }
}