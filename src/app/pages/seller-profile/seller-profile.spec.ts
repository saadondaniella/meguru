import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SellerProfile } from './seller-profile';

describe('SellerProfile', () => {
  let component: SellerProfile;
  let fixture: ComponentFixture<SellerProfile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SellerProfile],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerProfile);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
