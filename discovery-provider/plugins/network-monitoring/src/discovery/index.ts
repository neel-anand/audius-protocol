
import { 
    createNewRun, 
    importCids, 
    importContentNodes, 
    importUsers 
} from "./queries"

export const indexDiscovery = async (): Promise<number> => {

    console.log('[+] indexing discovery database')

    // Create new run in table `network_monitoring_index_blocks`
    const run_id = await createNewRun()

    // Pull Content Nodes list into table `network_monitoring_content_nodes`
    await importContentNodes(run_id)

    // Pull table `users` into table `network_monitoring_users`
    await importUsers(run_id)

    // Pull cids into table `network_monitoring_cids_from_discovery`
    await importCids(run_id)

    console.log(`[${run_id}] finished indexing discovery database`)

    return run_id
}