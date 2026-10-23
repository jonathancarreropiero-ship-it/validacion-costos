-- La solicitud puede ser atendida por quien la solicitó, siempre que no haya
-- participado en el Conteo 3. La restricción original impedía ese caso.
ALTER TABLE public.costo_validaciones_apoyo
  DROP CONSTRAINT IF EXISTS costo_validaciones_apoyo_check;
