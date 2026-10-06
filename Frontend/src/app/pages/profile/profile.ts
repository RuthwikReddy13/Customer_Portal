import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html'
})
export class Profile implements OnInit {

  profile: any = null;
  loading = true;
  refreshing = false;
  error = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile(isRefresh: boolean = false) {
    const customerId = localStorage.getItem('customer_id');

    if (!customerId) {
      this.error = 'Not signed in.';
      this.loading = false;
      this.refreshing = false;
      return;
    }

    if (isRefresh) {
      this.refreshing = true;
    } else {
      this.loading = true;
    }
    this.error = '';

    this.http.get<any>(`http://localhost:3000/profile?customer_id=${customerId}`)
      .subscribe({
        next: (res) => {
          this.profile = res?.ES_PROFILE || null;
          this.loading = false;
          this.refreshing = false;
        },
        error: (err) => {
          console.error('Profile load failed:', err);
          this.error = 'Failed to load profile data.';
          this.loading = false;
          this.refreshing = false;
        }
      });
  }

  refreshProfile() {
    this.loadProfile(true);
  }
}