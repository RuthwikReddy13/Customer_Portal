import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './invoice.html'
})
export class Invoice implements OnInit {
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
    value: 0,
    avgValue: 0,
    thisMonth: 0
  };

  // Monthly billing trend
  public trendData: ChartData<'bar'> = {
    labels: [],
    datasets: [{
      label: 'Billed Amount (EUR)',
      data: [],
      backgroundColor: 'rgba(139,92,246,0.8)',
      borderRadius: 8,
      borderSkipped: false,
      barThickness: 24
    }]
  };

  public trendOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: { label: (ctx) => `€ ${(ctx.parsed.y ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}` }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' }, callback: (v) => '€' + Number(v).toLocaleString() } },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } } }
    }
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

    this.http.get<any>(`http://localhost:3000/invoice?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          const et = res?.ET_INVOICE?.item;
          this.items = Array.isArray(et) ? et : (et ? [et] : []);
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          console.error('Invoice error:', err);
          this.error = 'Failed to load billing records.';
          this.loading = false;
        }
      });
  }

  buildCharts() {
    const monthMap: Record<string, number> = {};
    this.filteredItems.forEach(item => {
      const d = this.parseDate(item.FKDAT);
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = (monthMap[key] || 0) + (parseFloat(item.NETWR) || 0);
      }
    });
    const sorted = Object.keys(monthMap).sort();
    this.trendData = {
      labels: sorted.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' });
      }),
      datasets: [{ ...this.trendData.datasets[0], data: sorted.map(k => monthMap[k]) }]
    };
  }

  calculateMetrics() {
    this.metrics.total = this.filteredItems.length;
    this.metrics.value = this.filteredItems.reduce((s, i) => s + (parseFloat(i.NETWR) || 0), 0);
    this.metrics.avgValue = this.metrics.total ? this.metrics.value / this.metrics.total : 0;
    const now = new Date();
    this.metrics.thisMonth = this.filteredItems.filter(i => {
      const d = this.parseDate(i.FKDAT);
      return d != null && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
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
        (item.FKART || '').toLowerCase().includes(q); // Billing Type
      let matchDate = true;
      const d = this.parseDate(item.FKDAT);
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

  downloadPdf(vbeln: string) {
    if (!vbeln) return;
    console.log('📄 Requesting PDF for:', vbeln);
    
    this.http.get<any>(`http://localhost:3000/invoice/pdf?vbeln=${vbeln}`)
      .subscribe({
        next: (res: any) => {
          console.log('📥 SAP PDF Response:', res);
          
          // Try multiple potential field names
          let base64 = res?.EV_BASE64 || res?.EV_PDF || res?.E_PDF;
          
          // Fallback: If not found, look for any string that looks like a long base64
          if (!base64 && res && typeof res === 'object') {
            const values = Object.values(res);
            base64 = values.find(v => typeof v === 'string' && v.length > 500) as string;
          }
          
          if (!base64) {
            console.error('❌ No PDF data found in response keys:', Object.keys(res || {}));
            alert('PDF data not found in response. Please check terminal logs.');
            return;
          }

          try {
            const byteCharacters = atob(base64.trim());
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Invoice_${vbeln}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            console.log('✅ PDF Download triggered');
          } catch (e) {
            console.error('❌ Base64 Decoding Error:', e);
            alert('Failed to decode PDF data. It might not be a valid base64 string.');
          }
        },
        error: (err) => {
          console.error('❌ PDF Fetch Error:', err);
          alert('Failed to fetch invoice PDF from SAP.');
        }
      });
  }
}