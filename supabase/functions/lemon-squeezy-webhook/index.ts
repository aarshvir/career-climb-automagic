// Retire the old payment integration without changing accounts or granting plans.
import { retiredResponse } from '../retired-response.ts';
Deno.serve(retiredResponse);
