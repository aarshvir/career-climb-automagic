import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Checking email provider for:', email)

    // Query auth.identities to check what providers exist for this email
    const { data: identities, error } = await supabaseAdmin
      .schema('auth')
      .from('identities')
      .select('provider')
      .eq('email', email.toLowerCase())

    if (error) {
      console.error('Error querying identities:', error)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const providers = identities?.map(identity => identity.provider) || []
    const hasEmailProvider = providers.includes('email')
    const hasGoogleProvider = providers.includes('google')
    const exists = providers.length > 0

    console.log('Email check result:', {
      email,
      providers,
      exists,
      hasEmailProvider,
      hasGoogleProvider
    })

    return new Response(
      JSON.stringify({
        exists,
        providers,
        hasEmailProvider,
        hasGoogleProvider,
        canSignIn: hasEmailProvider,
        shouldUseGoogle: hasGoogleProvider && !hasEmailProvider
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in check-email-provider:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})