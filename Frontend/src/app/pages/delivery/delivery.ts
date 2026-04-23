import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './delivery.html'
})
export class Delivery implements OnInit {
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
    shipped: 0,
    pending: 0,
    reliability: 0
  };

  // Delivery Status Donut
  public statusData: ChartData<'doughnut'> = {
    labels: ['Shipped', 'Pending'],
    datasets: [{
      data: [0, 0],
      backgroundColor: ['#E85D5D', '#f59e0b'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderColor: '#ffffff',
      hoverBorderWidth: 4
    }]
  };

  public donutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 }
    },
    animation: { animateRotate: true, animateScale: true, duration: 800 }
  };

  // Monthly Delivery Volume
  public deliveryTrend: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { label: 'Shipped', data: [], backgroundColor: 'rgba(16,185,129,0.85)', borderRadius: 8, borderSkipped: false, barThickness: 18 },
      { label: 'Pending', data: [], backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 8, borderSkipped: false, barThickness: 18 }
    ]
  };

  public trendOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { font: { size: 10, weight: 'bold' }, color: '#64748b', boxWidth: 10, padding: 14, usePointStyle: true } },
      tooltip: { backgroundColor: '#1e293b', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } },
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

    this.http.get<any>(`http://localhost:3000/delivery?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          const et = res?.ET_DELIVERY?.item;
          this.items = Array.isArray(et) ? et : (et ? [et] : []);
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Delivery error:', err);
          this.error = 'Failed to load delivery records.';
          this.loading = false;
        }
      });
  }

  buildCharts() {
    // Donut
    this.statusData = {
      ...this.statusData,
      datasets: [{ ...this.statusData.datasets[0], data: [this.metrics.shipped, this.metrics.pending] }]
    };

    // Monthly trend
    const monthShippedMap: Record<string, number> = {};
    const monthPendingMap: Record<string, number> = {};
    this.filteredItems.forEach(item => {
      const d = this.parseDate(item.ERDAT); 
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        // Check WADAT or WADAT_RAW for actual shipment
        if (item.WADAT && item.WADAT !== '0000-00-00' && item.WADAT !== '00000000') monthShippedMap[key] = (monthShippedMap[key] || 0) + 1;
        else monthPendingMap[key] = (monthPendingMap[key] || 0) + 1;
      }
    });
    const allKeys = [...new Set([...Object.keys(monthShippedMap), ...Object.keys(monthPendingMap)])].sort();
    const labels = allKeys.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' }); });
    this.deliveryTrend = {
      labels,
      datasets: [
        { ...this.deliveryTrend.datasets[0], data: allKeys.map(k => monthShippedMap[k] || 0) },
        { ...this.deliveryTrend.datasets[1], data: allKeys.map(k => monthPendingMap[k] || 0) }
      ]
    };
  }

  calculateMetrics() {
    this.metrics.total = this.filteredItems.length;
    this.metrics.shipped = this.filteredItems.filter(i => i.WADAT && i.WADAT !== '0000-00-00' && i.WADAT !== '00000000').length;
    this.metrics.pending = this.metrics.total - this.metrics.shipped;
    this.metrics.reliability = this.metrics.total ? Math.round((this.metrics.shipped / this.metrics.total) * 100) : 0;
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
      const q = this.searchQuery.toLowerCase();
      const matchSearch =
        (item.VBELN || '').toLowerCase().includes(q) ||
        (item.LFART || '').toLowerCase().includes(q); // Delivery Type

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
}
