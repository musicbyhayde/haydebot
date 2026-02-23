import asyncio
import sys
import os
from datetime import datetime

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.logic import HaydeBotLogic
from app.services.supabase_service import airtable_service
from app.models.schemas import LeadCreate, ConversationState, ServiceType, LeadUpdate, LeadStatus

bot_logic = HaydeBotLogic()

async def create_mock_lead():
    print("\n--- Creating Mock Lead for Simulation ---")
    lead_data = LeadCreate(
        name="Simulation Customer",
        phone="972500000000",
        service=ServiceType.BAND,
        event_date="01.01.2027",
        location="Tel Aviv",
        guests="200",
        conversation_state=ConversationState.COMPLETED
    )
    lead = airtable_service.create_lead(lead_data)
    print(f"✅ Lead Created with ID: {lead['id']}")
    return lead['id']

async def simulate_musician_action(phone, action, lead_id):
    interactive_id = f"{action}_{lead_id}"
    print(f"\n--- Simulating Button Click: {action} for Lead {lead_id} ---")
    await bot_logic.handle_musician_interaction(
        musician_phone=phone,
        button_id=interactive_id
    )
    print(f"✅ Action {action} processed by bot.")

async def run_scheduler_tasks_mock(lead_id, phone):
    print("\n--- Running Scheduler Tasks Mock (Skipping Wait) ---")
    
    print(f"1. Simulating 15m reminder for lead {lead_id}...")
    await bot_logic.remind_musician_contact(lead_id, phone)
    
    print(f"2. Simulating 24h closing check for lead {lead_id}...")
    await bot_logic.finalize_musician_check(lead_id, phone)
    
    print("✅ Scheduler mocks finished.")

async def simulate_edge_cases(lead_id, phone):
    print("\n--- Simulation Edge Cases ---")
    
    # 1. Claim already claimed lead
    print("\nEdge Case 1: Claiming an already claimed lead...")
    # First, make sure it's claimed by someone
    # (The test musician will claim it first if we followed the menu)
    await bot_logic.handle_musician_interaction(phone, f"claim_{lead_id}")
    # Now try to claim again (same or different phone doesn't matter much if m_id is found)
    await bot_logic.handle_musician_interaction(phone, f"claim_{lead_id}")

    # 2. Claim a closed lead
    print("\nEdge Case 2: Claiming a CLOSED lead...")
    airtable_service.update_lead(lead_id, LeadUpdate(status=LeadStatus.CLOSED))
    await bot_logic.handle_musician_interaction(phone, f"claim_{lead_id}")

    # 3. Invalid lead ID
    print("\nEdge Case 3: Invalid Lead ID...")
    await bot_logic.handle_musician_interaction(phone, "claim_invalid_id_123")

    print("\n✅ Edge cases simulated.")

async def time_travel(lead_id):
    print("\n⏳ --- Time Machine ---")
    print("1. Expire 'Bot Mute' (Fast forward 24h so bot talks again)")
    print("2. Expire 'Session' (Fast forward 5h to trigger Resume check)")
    print("0. Cancel")
    opt = input("Choice: ")
    
    if opt == '1':
        # Set Bot_Mute_Until to a time in the past
        past_time = datetime.now() - timedelta(hours=25)
        airtable_service.update_lead(lead_id, LeadUpdate(bot_mute_until=past_time))
        print("✅ Bot mute expired! Send a real message to see bot reply.")
    elif opt == '2':
        # Set Last_Interaction to 5 hours ago
        past_time = datetime.now() - timedelta(hours=5)
        airtable_service.update_lead(lead_id, LeadUpdate(last_interaction=past_time))
        print("✅ Session expired! Reply to the bot to see 'Resume' prompt.")

async def main_menu():
    test_musician_phone = "972544500529" 
    current_lead_id = None

    while True:
        print("\n🎸 --- HaydeBot PlayGround ---")
        print(f"Active Simulation Lead: {current_lead_id}")
        print("-" * 40)
        print("1. Create NEW Mock Lead")
        print("2. [Musician] Click 'CLAIM'")
        print("3. [Musician] Click 'CONTACTED'")
        print("4. [Musician] Click 'CLOSED'")
        print("5. [System] Run Scheduler Mocks (Reminders/Check)")
        print("6. [Test] RUN EDGE CASES")
        print("7. ⏳ Time Travel (Simulate passing time)")
        print("0. EXIT")
        print("-" * 40)
        
        choice = input("\nSelect an option: ")

        if choice == '1':
            current_lead_id = await create_mock_lead()
        elif choice == '2':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await simulate_musician_action(test_musician_phone, "claim", current_lead_id)
        elif choice == '3':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await simulate_musician_action(test_musician_phone, "contacted", current_lead_id)
        elif choice == '4':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await simulate_musician_action(test_musician_phone, "closed", current_lead_id)
        elif choice == '5':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await run_scheduler_tasks_mock(current_lead_id, test_musician_phone)
        elif choice == '6':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await simulate_edge_cases(current_lead_id, test_musician_phone)
        elif choice == '7':
            if not current_lead_id: print("❌ Create a lead first!"); continue
            await time_travel(current_lead_id)
        elif choice == '0':
            break
        else:
            print("Invalid choice.")

if __name__ == "__main__":
    from datetime import timedelta
    asyncio.run(main_menu())
