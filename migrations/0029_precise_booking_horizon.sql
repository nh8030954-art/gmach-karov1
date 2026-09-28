ALTER TABLE items ADD COLUMN booking_horizon_minutes INTEGER CHECK (booking_horizon_minutes BETWEEN 1 AND 1576800);
