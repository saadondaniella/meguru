import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UpdatePassword } from './update-password';

describe('UpdatePassword', () => {
  let component: UpdatePassword;
  let fixture: ComponentFixture<UpdatePassword>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePassword],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdatePassword);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
