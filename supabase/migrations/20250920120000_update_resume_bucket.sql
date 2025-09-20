DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'jobassist'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
    VALUES (
      'jobassist',
      'jobassist',
      false,
      ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    );
  ELSE
    UPDATE storage.buckets AS b
    SET allowed_mime_types = (
      SELECT array_agg(DISTINCT mime_type)
      FROM (
        SELECT unnest(coalesce(b.allowed_mime_types, '{}')) AS mime_type
        UNION
        SELECT unnest(ARRAY[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ])
      ) AS combined
    )
    WHERE b.id = 'jobassist';
  END IF;
END $$;
