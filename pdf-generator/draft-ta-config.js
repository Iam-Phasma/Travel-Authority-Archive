import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config.js';

export const draftTaClient = createClient(supabaseConfig.url, supabaseConfig.anonKey);

// The most recent row is the shared configuration, including tables already populated manually.
export async function loadDraftTaConfig() {
    const { data, error } = await draftTaClient.from('draft_ta')
        .select('id, recommending, funds, approved, iso_no')
        .order('id', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Set up the draft TA signatories and ISO number in Settings first.');
    const { data: employees, error: employeeError } = await draftTaClient
        .from('employee_list').select('name, position');
    if (employeeError) throw employeeError;
    const signatories = {};
    for (const key of ['recommending', 'funds', 'approved']) {
        const employee = employees.find((item) => item.name === data[key]);
        if (!employee) throw new Error(`The ${key} signatory must be selected in Settings.`);
        signatories[key] = { name: employee.name, position: employee.position || '' };
    }
    if (!data.iso_no?.trim()) throw new Error('Set the draft TA ISO number in Settings first.');
    return { ...data, signatories };
}
