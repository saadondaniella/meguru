import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'update-password',
    loadComponent: () =>
      import('./pages/update-password/update-password').then((m) => m.UpdatePassword),
  },
  {
    path: 'seller-profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/seller-profile/seller-profile').then((m) => m.SellerProfile),
  },

  {
    path: 'listing-management',
    loadComponent: () =>
      import('./pages/listing-management/listing-management').then((m) => m.ListingManagement),
    canActivate: [authGuard],
  },

  {
    path: 'listings/:id',
    loadComponent: () =>
      import('./pages/listing-detail/listing-detail').then((m) => m.ListingDetail),
  },
];
