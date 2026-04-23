import { Component } from '@angular/core';
import { Router } from '@angular/router';
//import { ApiService } from '../../services/auth.service';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
})
export class Login {

customerId = '';
password = '';
errorMsg = '';

constructor(
private http: HttpClient,
private router: Router
) {}

onLogin() {

  const body = {
    customer_id: this.customerId,
    password: this.password
  };

  this.http.post('http://localhost:3000/login', body)
    .subscribe((res: any) => {

      console.log("LOGIN RESPONSE =", res);

      if (res.status === "S") {
        localStorage.setItem("customer_id", this.customerId);
        this.router.navigate(['/dashboard']);
      } else {
        this.errorMsg = res.message;
      }

    }, (error) => {
      console.error("ERROR:", error);
      this.errorMsg = "Login failed. Please try again.";
    });

}
}