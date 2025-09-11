import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LemonSqueezyWebhook {
  meta: {
    event_name: string;
  };
  data: {
    id: string;
    attributes: {
      customer_id: string;
      user_email: string;
      status: string;
      product_name: string;
      variant_name: string;
      first_order_item: {
        price: number;
      };
    };
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const webhook: LemonSqueezyWebhook = await req.json()
    console.log('Received webhook:', webhook.meta.event_name)

    const { meta, data } = webhook
    const eventName = meta.event_name

    // Handle different webhook events
    switch (eventName) {
      case 'order_created':
        console.log('Processing order created for:', data.attributes.user_email)
        
        // Find or create user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', data.attributes.user_email)
          .single()

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error finding profile:', profileError)
          throw profileError
        }

        // Create subscription record
        const subscriptionData = {
          user_id: profile?.id,
          lemon_squeezy_id: data.id,
          customer_id: data.attributes.customer_id,
          status: data.attributes.status,
          plan_name: data.attributes.variant_name,
          price: data.attributes.first_order_item.price,
          user_email: data.attributes.user_email
        }

        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .upsert(subscriptionData, { 
            onConflict: 'lemon_squeezy_id' 
          })

        if (subscriptionError) {
          console.error('Error creating subscription:', subscriptionError)
          throw subscriptionError
        }

        console.log('Subscription created successfully')
        break

      case 'subscription_updated':
        console.log('Processing subscription update for:', data.attributes.user_email)
        
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: data.attributes.status,
            plan_name: data.attributes.variant_name,
            price: data.attributes.first_order_item.price
          })
          .eq('lemon_squeezy_id', data.id)

        if (updateError) {
          console.error('Error updating subscription:', updateError)
          throw updateError
        }

        console.log('Subscription updated successfully')
        break

      case 'subscription_cancelled':
        console.log('Processing subscription cancellation for:', data.attributes.user_email)
        
        const { error: cancelError } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('lemon_squeezy_id', data.id)

        if (cancelError) {
          console.error('Error cancelling subscription:', cancelError)
          throw cancelError
        }

        console.log('Subscription cancelled successfully')
        break

      default:
        console.log('Unhandled webhook event:', eventName)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})